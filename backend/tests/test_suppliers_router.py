from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
import uuid

import pytest
from fastapi import HTTPException

from backend.app.api.routers import suppliers
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import UserRole
from backend.app.schemas import SupplierChequeInput, SupplierChequeStatusUpdate


def make_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


class DummySession:
    def __init__(self, scalar_result=None, scalars_result=None) -> None:
        self.scalar_result = scalar_result
        self.scalars_result = scalars_result or []
        self.added = []
        self.deleted = []
        self.committed = False
        self.refreshed = []

    def scalar(self, _statement):
        return self.scalar_result

    def scalars(self, _statement):
        return self.scalars_result

    def add(self, value) -> None:
        self.added.append(value)

    def delete(self, value) -> None:
        self.deleted.append(value)

    def commit(self) -> None:
        self.committed = True

    def refresh(self, value) -> None:
        self.refreshed.append(value)


def test_create_supplier_cheque(monkeypatch):
    actor = make_actor()
    branch_id = uuid.uuid4()
    db = DummySession()

    payload = SupplierChequeInput(
        branch_id=branch_id,
        payee_name="Malwana",
        cheque_number="000028",
        amount=Decimal("50000.00"),
        cheque_date=date(2026, 9, 2),
        status="pending",
        note="Material payment",
    )

    monkeypatch.setattr(suppliers, "resolve_branch_scope", lambda _actor, b_id: b_id)
    monkeypatch.setattr(suppliers, "ensure_branch_in_tenant", lambda _db, _t_id, _b_id: None)

    created = suppliers.create_supplier_cheque(payload, actor, db)

    assert len(db.added) == 1
    assert db.committed is True
    assert created.payee_name == "Malwana"
    assert created.cheque_number == "000028"
    assert created.amount == Decimal("50000.00")
    assert created.cheque_date == date(2026, 9, 2)
    assert created.status == "pending"
    assert created.cleared_at is None
    assert created.note == "Material payment"


def test_update_supplier_cheque_status_to_paid(monkeypatch):
    actor = make_actor()
    cheque_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    existing_cheque = SimpleNamespace(
        id=cheque_id,
        tenant_id=actor.tenant_id,
        branch_id=branch_id,
        payee_name="Malwana",
        cheque_number="000028",
        amount=Decimal("50000.00"),
        cheque_date=date(2026, 9, 2),
        status="pending",
        cleared_at=None,
        note=None,
    )
    db = DummySession(existing_cheque)

    monkeypatch.setattr(suppliers, "_get_cheque_or_404", lambda *_args, **_kwargs: existing_cheque)

    status_update = SupplierChequeStatusUpdate(status="paid")
    updated = suppliers.update_supplier_cheque_status(cheque_id, status_update, actor, db)

    assert updated.status == "paid"
    assert updated.cleared_at is not None
    assert db.committed is True


def test_update_supplier_cheque_status_to_pending(monkeypatch):
    actor = make_actor()
    cheque_id = uuid.uuid4()
    branch_id = uuid.uuid4()
    existing_cheque = SimpleNamespace(
        id=cheque_id,
        tenant_id=actor.tenant_id,
        branch_id=branch_id,
        payee_name="Oceanic",
        cheque_number="000038",
        amount=Decimal("175000.00"),
        cheque_date=date(2026, 9, 20),
        status="paid",
        cleared_at=datetime.now(timezone.utc),
        note=None,
    )
    db = DummySession(existing_cheque)

    monkeypatch.setattr(suppliers, "_get_cheque_or_404", lambda *_args, **_kwargs: existing_cheque)

    status_update = SupplierChequeStatusUpdate(status="pending")
    updated = suppliers.update_supplier_cheque_status(cheque_id, status_update, actor, db)

    assert updated.status == "pending"
    assert updated.cleared_at is None
    assert db.committed is True


def test_delete_supplier_cheque(monkeypatch):
    actor = make_actor()
    cheque_id = uuid.uuid4()
    existing_cheque = SimpleNamespace(
        id=cheque_id,
        tenant_id=actor.tenant_id,
        branch_id=uuid.uuid4(),
    )
    db = DummySession(existing_cheque)

    monkeypatch.setattr(suppliers, "_get_cheque_or_404", lambda *_args, **_kwargs: existing_cheque)

    suppliers.delete_supplier_cheque(cheque_id, actor, db)

    assert len(db.deleted) == 1
    assert db.committed is True
