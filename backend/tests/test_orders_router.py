import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from fastapi import BackgroundTasks

from backend.app.api.routers import orders
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import OrderStatus, PaymentMethod, UserRole
from backend.app.schemas import OrderStatusUpdate, PaymentInput


def test_build_measurement_legacy_id_stays_unique_for_same_source() -> None:
    first = orders._build_measurement_legacy_id("MEAS177679702879973570")
    second = orders._build_measurement_legacy_id("MEAS177679702879973570")

    assert first != second
    assert first.startswith("MEAS177679702879973570-")
    assert second.startswith("MEAS177679702879973570-")


def test_build_measurement_legacy_id_uses_default_prefix_when_source_missing() -> None:
    generated = orders._build_measurement_legacy_id(None)

    assert generated.startswith("MEAS-")


def test_normalize_order_status_filter_accepts_value_case_insensitively() -> None:
    assert orders._normalize_order_status_filter("pending") is OrderStatus.PENDING
    assert orders._normalize_order_status_filter("In Progress") is OrderStatus.IN_PROGRESS
    assert orders._normalize_order_status_filter("in_progress") is OrderStatus.IN_PROGRESS
    assert orders._normalize_order_status_filter("PACKED") is OrderStatus.PACKED


def test_digits_only_strips_phone_formatting() -> None:
    assert orders._digits_only("+94 77-123-4567") == "94771234567"


def test_get_order_or_404_reloads_from_database_state(monkeypatch) -> None:
    actor = make_actor()
    expected_order = object()
    captured = {}

    class CaptureSession:
        def scalar(self, stmt):
            captured["stmt"] = stmt
            return expected_order

    monkeypatch.setattr(orders, "_apply_order_scope", lambda stmt, _db, _actor, branch_id=None: stmt)

    result = orders._get_order_or_404(CaptureSession(), actor, uuid.uuid4())

    assert result is expected_order
    assert captured["stmt"]._execution_options.get("populate_existing") is True


def make_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


class DummySession:
    def __init__(self) -> None:
        self.added: list[object] = []
        self.commits = 0
        self.refreshed: list[object] = []

    def add(self, value: object) -> None:
        self.added.append(value)

    def flush(self) -> None:
        return None

    def commit(self) -> None:
        self.commits += 1

    def refresh(self, value: object) -> None:
        self.refreshed.append(value)


def test_add_payment_queues_confirmation_from_reloaded_order(monkeypatch) -> None:
    actor = make_actor()
    db = DummySession()
    background_tasks = BackgroundTasks()
    order_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    customer = SimpleNamespace(id=uuid.uuid4(), name="Aswin")
    initial_order = SimpleNamespace(id=order_id, branch_id=branch_id)
    payment_id = uuid.uuid4()
    persisted_payment = SimpleNamespace(id=payment_id, amount=Decimal("50.00"), payment_date=date(2026, 4, 22))
    loaded_order = SimpleNamespace(
        id=order_id,
        branch_id=branch_id,
        customer=customer,
        payments=[persisted_payment],
    )
    captured: dict[str, object] = {}
    call_count = {"value": 0}

    def fake_get_order(_db, _actor, current_order_id):
        assert current_order_id == order_id
        call_count["value"] += 1
        return initial_order if call_count["value"] == 1 else loaded_order

    def fake_queue_payment_confirmation_sms(_db, order, payment, current_customer):
        captured["order"] = order
        captured["payment"] = payment
        captured["customer"] = current_customer
        return SimpleNamespace(id=uuid.uuid4())

    monkeypatch.setattr(orders, "_get_order_or_404", fake_get_order)
    monkeypatch.setattr(
        orders,
        "Payment",
        lambda **kwargs: SimpleNamespace(
            id=payment_id,
            tenant_id=kwargs["tenant_id"],
            branch_id=kwargs["branch_id"],
            order_id=kwargs["order_id"],
            collector_user_id=kwargs["collector_user_id"],
            amount=kwargs["amount"],
            payment_date=kwargs["payment_date"],
            method=kwargs["method"],
            note=kwargs["note"],
        ),
    )
    monkeypatch.setattr(orders, "queue_payment_confirmation_sms", fake_queue_payment_confirmation_sms)
    monkeypatch.setattr(orders, "queue_thank_you_sms", lambda *_args, **_kwargs: None)
    scheduled: dict[str, object] = {}
    monkeypatch.setattr(
        orders,
        "_schedule_immediate_sms_dispatch",
        lambda _background_tasks, logs: scheduled.setdefault("logs", logs),
    )

    payload = PaymentInput(
        amount=Decimal("50.00"),
        payment_date=date(2026, 4, 22),
        method=PaymentMethod.CASH,
        note="QA payment",
    )

    payment = orders.add_payment(order_id, payload, background_tasks, actor, db)

    assert payment.amount == Decimal("50.00")
    assert captured["order"] is loaded_order
    assert captured["payment"] is persisted_payment
    assert captured["customer"] is customer
    assert scheduled["logs"][0].id is not None
    assert db.commits == 2
    assert db.refreshed == [payment]


def test_update_order_status_to_due_queues_due_sms(monkeypatch) -> None:
    actor = make_actor()
    db = DummySession()
    background_tasks = BackgroundTasks()
    order_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    customer = SimpleNamespace(name="Aswin")
    initial_order = SimpleNamespace(id=order_id, branch_id=branch_id, status=OrderStatus.PACKED)
    current_order = SimpleNamespace(
        id=order_id,
        branch_id=branch_id,
        status=OrderStatus.DUE,
        customer=customer,
        due_date=date(2026, 4, 23),
        order_date=date(2026, 4, 22),
    )
    dispatched_logs: list[object | None] = []
    call_count = {"value": 0}

    def fake_get_order(_db, _actor, current_order_id):
        assert current_order_id == order_id
        call_count["value"] += 1
        return initial_order if call_count["value"] == 1 else current_order

    monkeypatch.setattr(orders, "_get_order_or_404", fake_get_order)
    monkeypatch.setattr(orders, "ensure_branch_in_tenant", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(orders, "_enforce_branch_status_policy", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(orders, "_serialize_order", lambda order: order)
    monkeypatch.setattr(orders, "queue_order_ready_sms", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(orders, "queue_order_delivered_sms", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(orders, "queue_due_reminder_sms", lambda *_args, **_kwargs: SimpleNamespace(id=uuid.uuid4()))
    monkeypatch.setattr(orders, "_schedule_immediate_sms_dispatch", lambda _background_tasks, logs: dispatched_logs.extend(logs))

    result = orders.update_order_status(order_id, OrderStatusUpdate(status=OrderStatus.DUE), background_tasks, actor, db)

    assert result is current_order
    assert len(dispatched_logs) == 1
    assert db.commits == 2


def test_update_order_status_to_delivered_queues_delivered_sms(monkeypatch) -> None:
    actor = make_actor()
    db = DummySession()
    background_tasks = BackgroundTasks()
    order_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    customer = SimpleNamespace(name="Aswin")
    initial_order = SimpleNamespace(id=order_id, branch_id=branch_id, status=OrderStatus.DUE)
    current_order = SimpleNamespace(
        id=order_id,
        branch_id=branch_id,
        status=OrderStatus.DELIVERED,
        customer=customer,
    )
    dispatched_logs: list[object | None] = []
    call_count = {"value": 0}

    def fake_get_order(_db, _actor, current_order_id):
        assert current_order_id == order_id
        call_count["value"] += 1
        return initial_order if call_count["value"] == 1 else current_order

    monkeypatch.setattr(orders, "_get_order_or_404", fake_get_order)
    monkeypatch.setattr(orders, "ensure_branch_in_tenant", lambda *_args, **_kwargs: SimpleNamespace())
    monkeypatch.setattr(orders, "_enforce_branch_status_policy", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(orders, "_serialize_order", lambda order: order)
    monkeypatch.setattr(orders, "queue_order_ready_sms", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(orders, "queue_due_reminder_sms", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(orders, "queue_order_delivered_sms", lambda *_args, **_kwargs: SimpleNamespace(id=uuid.uuid4()))
    monkeypatch.setattr(orders, "_schedule_immediate_sms_dispatch", lambda _background_tasks, logs: dispatched_logs.extend(logs))

    result = orders.update_order_status(order_id, OrderStatusUpdate(status=OrderStatus.DELIVERED), background_tasks, actor, db)

    assert result is current_order
    assert len(dispatched_logs) == 1
    assert db.commits == 2
