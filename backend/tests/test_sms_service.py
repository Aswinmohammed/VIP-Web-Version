import json
import uuid
from decimal import Decimal
from types import SimpleNamespace

from backend.app.services import sms as sms_service
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import OrderStatus, UserRole
from backend.app.schemas import SmsManualSendRequest
from backend.app.services.sms import calculate_order_balance, calculate_paid_total, calculate_sms_cost, estimate_sms_segments, format_contact_phone, format_currency_for_sms, is_order_ready_status, normalize_phone_number, queue_due_reminder_sms, queue_order_delivered_sms, record_manual_order_sms, record_manual_test_sms, render_sms_template, send_via_gateway


def test_normalize_phone_number_accepts_local_sri_lankan_mobile() -> None:
    normalized, is_valid = normalize_phone_number("0778514532")

    assert normalized == "94778514532"
    assert is_valid is True


def test_normalize_phone_number_rejects_invalid_values() -> None:
    normalized, is_valid = normalize_phone_number("1234")

    assert normalized is None
    assert is_valid is False


def test_render_sms_template_substitutes_known_variables() -> None:
    rendered = render_sms_template(
        "Dear {Name}, order {OrderID} balance is Rs.{Balance}",
        {"Name": "Aswin", "OrderID": "ORD-1001", "Balance": "250.00"},
    )

    assert rendered == "Dear Aswin, order ORD-1001 balance is Rs.250.00"


def test_render_sms_template_preserves_separate_footer_line() -> None:
    rendered = render_sms_template(
        "Dear {Name}, order {OrderID} confirmed.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
        {"Name": "Aswin", "OrderID": "ORD-1001"},
    )

    assert rendered == "Dear Aswin, order ORD-1001 confirmed.\n\nThank you - VIP Tailors & Fashion Pvt Ltd."


def test_render_sms_template_preserves_indented_owner_phone_line() -> None:
    rendered = render_sms_template(
        "For More Details: {BranchPhone}\n                             077 777 0811",
        {"BranchPhone": "077 845 6931"},
    )

    assert rendered == "For More Details: 077 845 6931\n                             077 777 0811"


def test_estimate_sms_segments_and_cost_for_ascii_text() -> None:
    segments = estimate_sms_segments("A" * 161)
    cost = calculate_sms_cost(segments, Decimal("4.50"))

    assert segments == 2
    assert cost == Decimal("9.00")


def test_is_order_ready_status_accepts_packed() -> None:
    assert is_order_ready_status(OrderStatus.PACKED) is True
    assert is_order_ready_status(OrderStatus.DELIVERED) is False


def test_calculate_paid_total_uses_payments_without_double_counting_advance() -> None:
    order = SimpleNamespace(
        advance=Decimal("100.00"),
        payments=[SimpleNamespace(amount=Decimal("100.00")), SimpleNamespace(amount=Decimal("50.00"))],
    )

    paid_total = calculate_paid_total(order)

    assert paid_total == Decimal("150.00")


def test_calculate_order_balance_falls_back_to_advance_and_never_goes_negative() -> None:
    order = SimpleNamespace(
        discount=Decimal("0.00"),
        advance=Decimal("80.00"),
        items=[SimpleNamespace(quantity=1, price_per_unit=Decimal("50.00"))],
        payments=[],
    )

    balance = calculate_order_balance(order)

    assert balance == Decimal("0.00")


def test_build_order_variables_include_paid_amount_for_combined_confirmation() -> None:
    order = SimpleNamespace(
        order_number="ORD-1001",
        order_date=sms_service.date(2026, 4, 22),
        due_date=sms_service.date(2026, 4, 25),
        discount=Decimal("0.00"),
        advance=Decimal("0.00"),
        items=[SimpleNamespace(quantity=1, price_per_unit=Decimal("120.00"))],
        payments=[SimpleNamespace(amount=Decimal("50.00"))],
        branch_rel=SimpleNamespace(phone="0777770811"),
    )
    customer = SimpleNamespace(name="Aswin")

    variables = sms_service._build_order_variables(order, customer)

    assert variables["Amount"] == "120.00"
    assert variables["PaidAmount"] == "50.00"
    assert variables["Balance"] == "70.00"
    assert variables["Date"] == "2026-04-25"
    assert variables["BranchName"] == "Branch"
    assert variables["BranchPhone"] == "077 777 0811"


def test_build_order_variables_include_branch_name_when_available() -> None:
    order = SimpleNamespace(
        order_number="ORD-1002",
        order_date=sms_service.date(2026, 4, 22),
        due_date=sms_service.date(2026, 4, 25),
        discount=Decimal("0.00"),
        advance=Decimal("0.00"),
        items=[SimpleNamespace(quantity=1, price_per_unit=Decimal("120.00"))],
        payments=[],
        branch_rel=SimpleNamespace(name="STR Branch", phone="0777770811"),
    )
    customer = SimpleNamespace(name="Nifra")

    variables = sms_service._build_order_variables(order, customer)

    assert variables["BranchName"] == "STR Branch"
    assert variables["BranchPhone"] == "077 777 0811"


def test_format_contact_phone_formats_sri_lankan_local_display() -> None:
    assert format_contact_phone("94777770811") == "077 777 0811"
    assert format_contact_phone("0777770811") == "077 777 0811"
    assert format_contact_phone(None) == "Contact branch directly"


def test_order_confirmation_template_includes_branch_and_owner_phone_line() -> None:
    assert "For More Details: {BranchPhone}" in sms_service.ORDER_CONFIRMATION_TEMPLATE_CONTENT
    assert "077 777 0811" in sms_service.ORDER_CONFIRMATION_TEMPLATE_CONTENT


def test_due_reminder_template_uses_pending_payment_wording() -> None:
    assert "is pending payment." in sms_service.DUE_REMINDER_TEMPLATE_CONTENT


def test_format_currency_for_sms_adds_thousands_separator() -> None:
    assert format_currency_for_sms(Decimal("3000")) == "3,000.00"


def test_send_via_gateway_uses_intech_header_and_payload(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class DummyResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self) -> bytes:
            return b'{"message_id":"msg-123"}'

    def fake_urlopen(req, timeout=20):
        captured["headers"] = dict(req.header_items())
        captured["body"] = json.loads(req.data.decode("utf-8"))
        captured["timeout"] = timeout
        return DummyResponse()

    monkeypatch.setattr("backend.app.services.sms.request.urlopen", fake_urlopen)
    monkeypatch.delenv("VIP_SMS_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.sms._load_env_file_values", lambda: {"VIP_SMS_API_KEY": "abc123"})

    settings = SimpleNamespace(
        provider_name="Intech SMS",
        api_base_url="https://sms.intechitsolutions.com/api/send",
        sender_id="VIPTAILOR",
        api_key_ref="env:VIP_SMS_API_KEY",
    )

    provider_message_id, parsed = send_via_gateway(settings, "94778514532", "Hello World!")

    assert provider_message_id == "msg-123"
    assert parsed["message_id"] == "msg-123"
    assert captured["headers"]["X-api-key"] == "abc123"
    assert captured["body"] == {
        "sender_id": "VIPTAILOR",
        "message": "Hello World!",
        "recipients": ["94778514532"],
    }


def test_resolve_api_key_reads_dotenv_values_when_os_env_is_missing(monkeypatch) -> None:
    monkeypatch.delenv("VIP_SMS_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.sms._load_env_file_values", lambda: {"VIP_SMS_API_KEY": "from-dotenv"})

    resolved = sms_service._resolve_api_key("env:VIP_SMS_API_KEY")

    assert resolved == "from-dotenv"


def test_record_manual_test_sms_uses_default_branch_when_missing(monkeypatch) -> None:
    tenant_id = uuid.uuid4()
    fallback_branch_id = uuid.uuid4()
    actor = AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )
    payload = SmsManualSendRequest(
        branch_id=None,
        phone="0778514532",
        message="Testing SMS",
    )

    settings = SimpleNamespace(
        cost_per_segment=Decimal("4.50"),
        provider_name="Intech SMS",
        api_base_url="https://sms.intechitsolutions.com/api/send",
        sender_id="VIPTAILOR",
        api_key_ref="env:VIP_SMS_API_KEY",
    )

    class DummySession:
        def __init__(self) -> None:
            self.added = []

        def scalar(self, _stmt):
            return fallback_branch_id

        def add(self, value) -> None:
            self.added.append(value)

        def flush(self) -> None:
            return None

    db = DummySession()

    monkeypatch.setattr("backend.app.services.sms.get_or_create_sms_settings", lambda *_args, **_kwargs: settings)
    monkeypatch.setattr("backend.app.services.sms.send_via_gateway", lambda *_args, **_kwargs: ("msg-123", {"message_id": "msg-123"}))

    log = record_manual_test_sms(db, actor, payload)

    assert log.branch_id == fallback_branch_id
    assert log.status == "sent"
    assert log.provider_message_id == "msg-123"


def test_record_manual_order_sms_dispatches_queued_log_immediately(monkeypatch) -> None:
    actor = AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=uuid.uuid4(),
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )
    customer = SimpleNamespace(id=uuid.uuid4())
    order = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=actor.tenant_id,
        branch_id=actor.branch_id,
        customer=customer,
    )
    payload = SimpleNamespace(phone="0778514532", message="Due reminder")
    queued_log = SimpleNamespace(id=uuid.uuid4(), status=sms_service.SmsLogStatus.QUEUED)

    class DummySession:
        def flush(self) -> None:
            return None

    db = DummySession()
    dispatched: dict[str, object] = {}

    monkeypatch.setattr("backend.app.services.sms.queue_sms_message", lambda *_args, **_kwargs: queued_log)
    monkeypatch.setattr(
        "backend.app.services.sms.dispatch_sms_logs_now",
        lambda _db, ids: dispatched.setdefault("ids", ids) or 1,
    )

    log = record_manual_order_sms(db, actor, order, payload)

    assert log is queued_log
    assert dispatched["ids"] == [queued_log.id]


def test_dispatch_sms_logs_now_sends_due_logs_immediately(monkeypatch) -> None:
    queued_log = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        phone_normalized="94778514532",
        message_body="Immediate SMS",
        status=sms_service.SmsLogStatus.QUEUED,
        scheduled_at=None,
        provider_message_id=None,
        sent_at=None,
        actual_cost=Decimal("0.00"),
        estimated_cost=Decimal("4.50"),
        error_message="old error",
        retry_count=0,
        campaign_id=None,
    )

    class DummyDispatchSession:
        def __init__(self) -> None:
            self.flushed = False

        def scalars(self, _stmt):
            return [queued_log]

        def flush(self) -> None:
            self.flushed = True

    db = DummyDispatchSession()

    monkeypatch.setattr("backend.app.services.sms.get_or_create_sms_settings", lambda *_args, **_kwargs: SimpleNamespace(max_retries=3))
    monkeypatch.setattr("backend.app.services.sms.send_via_gateway", lambda *_args, **_kwargs: ("msg-immediate", {"message_id": "msg-immediate"}))

    processed = sms_service.dispatch_sms_logs_now(db, [queued_log.id])

    assert processed == 1
    assert queued_log.status == sms_service.SmsLogStatus.SENT
    assert queued_log.provider_message_id == "msg-immediate"
    assert queued_log.actual_cost == Decimal("4.50")
    assert queued_log.error_message is None
    assert db.flushed is True


def test_queue_due_reminder_sms_uses_daily_dedupe_key(monkeypatch) -> None:
    captured: dict[str, object] = {}
    reference_date = sms_service.date(2026, 4, 22)
    order = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=uuid.uuid4(),
        order_number="ORD-1001",
        due_date=reference_date,
        order_date=reference_date,
        discount=Decimal("0.00"),
        advance=Decimal("0.00"),
        items=[],
        payments=[],
    )
    customer = SimpleNamespace(name="Aswin")

    monkeypatch.setattr("backend.app.services.sms.queue_transactional_sms", lambda *_args, **kwargs: captured.update(kwargs) or "queued")

    result = queue_due_reminder_sms(None, order, customer, reference_date=reference_date)

    assert result == "queued"
    assert captured["template_code"] == "due_reminder"
    assert captured["dedupe_key"] == f"due_reminder:{order.id}:2026-04-22"


def test_queue_order_delivered_sms_uses_delivered_template(monkeypatch) -> None:
    captured: dict[str, object] = {}
    delivered_date = sms_service.date(2026, 4, 22)
    order = SimpleNamespace(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=uuid.uuid4(),
        order_number="ORD-2002",
        due_date=delivered_date,
        order_date=delivered_date,
        discount=Decimal("0.00"),
        advance=Decimal("0.00"),
        items=[],
        payments=[],
    )
    customer = SimpleNamespace(name="Aswin")

    monkeypatch.setattr("backend.app.services.sms.queue_transactional_sms", lambda *_args, **kwargs: captured.update(kwargs) or "queued")

    result = queue_order_delivered_sms(None, order, customer, delivered_date=delivered_date)

    assert result == "queued"
    assert captured["template_code"] == "order_delivered"
    assert captured["dedupe_key"] == f"order_delivered:{order.id}"


def test_sync_existing_default_template_upgrades_order_confirmation_footer() -> None:
    template = SimpleNamespace(
        code="order_confirmation",
        name="Order Confirmation",
        content="Dear {Name}, your order {OrderID} has been placed successfully. Total: Rs.{Amount}. Due date: {Date}. Thank you - VIP Tailors",
        variables_json=[],
    )

    changed = sms_service._sync_existing_default_template(template, {
        "name": "Order & Due Confirmation",
        "content": sms_service.ORDER_CONFIRMATION_TEMPLATE_CONTENT,
    })

    assert changed is True
    assert template.name == "Order & Due Confirmation"
    assert template.content == sms_service.ORDER_CONFIRMATION_TEMPLATE_CONTENT
    assert template.variables_json == list(sms_service.SMS_TEMPLATE_VARIABLES)
