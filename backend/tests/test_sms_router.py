import uuid
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from backend.app.api.routers import sms
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import Order, OrderStatus, SmsLog, SmsLogStatus, UserRole
from backend.app.schemas import (
    SmsBulkDueOrderSendRequest,
    SmsBulkPackedOrderSendRequest,
    SmsManualSendRequest,
)


def make_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


class DummySession:
    def __init__(self, orders=None):
        self.orders = orders or []

    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None

    def scalars(self, _stmt):
        return iter(self.orders)

    def scalar(self, _stmt):
        return self.orders[0] if self.orders else None


def test_send_test_sms_returns_400_for_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = make_actor()
    db = DummySession()
    payload = SmsManualSendRequest(
        branch_id=None,
        phone="0778514532",
        message="Testing SMS",
    )

    monkeypatch.setattr(sms, "record_manual_test_sms", lambda *_args, **_kwargs: (_ for _ in ()).throw(ValueError("branch_id is required")))

    with pytest.raises(HTTPException) as exc:
        sms.send_test_sms(payload, actor, db)

    assert exc.value.status_code == 400
    assert exc.value.detail == "branch_id is required"


def test_send_packed_order_messages_finds_and_sends(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = make_actor()
    order_id = uuid.uuid4()
    mock_customer = MagicMock(phone="0771234567")
    mock_customer.name = "John Doe"
    mock_order = MagicMock(
        id=order_id,
        order_number="ORD-001",
        legacy_id=None,
        status=OrderStatus.PACKED,
        customer=mock_customer,
        branch_rel=None,
        due_date=None,
        order_date="2026-05-10",
        items=[],
        payments=[],
        discount=Decimal("0.00"),
        advance=Decimal("0.00"),
    )
    db = DummySession(orders=[mock_order])

    dummy_log = MagicMock(status=SmsLogStatus.SENT)
    monkeypatch.setattr(sms, "record_manual_order_sms", lambda *_args, **_kwargs: dummy_log)
    monkeypatch.setattr(sms, "calculate_order_balance", lambda _order: Decimal("0.00"))

    payload = SmsBulkPackedOrderSendRequest(order_ids=[str(order_id)])
    response = sms.send_packed_order_messages(payload, actor, db)

    assert response.total == 1
    assert response.sent == 1
    assert response.failed == 0
    assert response.skipped == 0


def test_send_due_order_messages_finds_and_sends(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = make_actor()
    order_id = uuid.uuid4()
    mock_customer = MagicMock(phone="0771234567")
    mock_customer.name = "Jane Doe"
    mock_order = MagicMock(
        id=order_id,
        order_number="ORD-002",
        legacy_id=None,
        status=OrderStatus.DUE,
        customer=mock_customer,
        branch_rel=None,
        due_date=None,
        order_date="2026-05-10",
        items=[],
        payments=[],
        discount=Decimal("0.00"),
        advance=Decimal("0.00"),
    )
    db = DummySession(orders=[mock_order])

    monkeypatch.setattr(sms, "calculate_order_balance", lambda _order: Decimal("500.00"))
    dummy_log = MagicMock(status=SmsLogStatus.SENT)
    monkeypatch.setattr(sms, "record_manual_order_sms", lambda *_args, **_kwargs: dummy_log)

    payload = SmsBulkDueOrderSendRequest(order_ids=["ORD-002"])
    response = sms.send_due_order_messages(payload, actor, db)

    assert response.total == 1
    assert response.sent == 1
    assert response.failed == 0
    assert response.skipped == 0
