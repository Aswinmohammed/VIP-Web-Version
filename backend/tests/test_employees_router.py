from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
import uuid

from backend.app.api.routers import employees
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import UserRole
from backend.app.schemas import EmployeeSalaryPaymentInput, EmployeeWorkLogInput


def make_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


class DummySession:
    def __init__(self, scalar_result=None) -> None:
        self.scalar_result = scalar_result
        self.added = []
        self.committed = False
        self.refreshed = []

    def scalar(self, _statement):
        return self.scalar_result

    def add(self, value) -> None:
        self.added.append(value)

    def commit(self) -> None:
        self.committed = True

    def refresh(self, value) -> None:
        self.refreshed.append(value)


def test_normalize_branch_piece_rate_history_serializes_temporal_values():
    history = [
        SimpleNamespace(
            id="rate-1",
            rate=Decimal("125.50"),
            effective_from=date(2026, 4, 20),
            note="launch",
            created_at=datetime(2026, 4, 20, 10, 30, tzinfo=timezone.utc),
        )
    ]

    normalized = employees._normalize_branch_piece_rate_history(history)

    assert normalized == [
        {
            "id": "rate-1",
            "rate": 125.5,
            "effective_from": "2026-04-20",
            "note": "launch",
            "created_at": "2026-04-20T10:30:00+00:00",
        }
    ]


def test_create_employee_work_log_reuses_existing_legacy_id(monkeypatch):
    actor = make_actor()
    employee = SimpleNamespace(id=uuid.uuid4(), branch_id=uuid.uuid4())
    existing_work_log = SimpleNamespace(
        tenant_id=actor.tenant_id,
        branch_id=employee.branch_id,
        employee_id=employee.id,
        legacy_id="WORK1",
        dress_type="Old",
        quantity=1,
        unit_price=Decimal("100"),
        total_amount=Decimal("100"),
        work_date=date(2026, 4, 19),
        recorded_at=None,
        start_hour=None,
        end_hour=None,
        salary_per_hour=None,
        auto_generated=False,
        source_branch_id=None,
        source_order_id=None,
        source_order_item_id=None,
    )
    db = DummySession(existing_work_log)
    payload = EmployeeWorkLogInput(
        id="WORK1",
        dress_type="Shirt",
        quantity=2,
        unit_price=Decimal("150"),
        total_amount=Decimal("300"),
        work_date=date(2026, 4, 20),
        recorded_at="2026-04-20T12:00:00Z",
    )

    monkeypatch.setattr(employees, "_get_employee_or_404", lambda *_args, **_kwargs: employee)

    saved = employees.create_employee_work_log(employee.id, payload, actor, db)

    assert saved is existing_work_log
    assert db.added == []
    assert db.committed is True
    assert db.refreshed == [existing_work_log]
    assert existing_work_log.legacy_id == "WORK1"
    assert existing_work_log.dress_type == "Shirt"
    assert existing_work_log.quantity == 2
    assert existing_work_log.total_amount == Decimal("300")


def test_create_employee_salary_payment_reuses_existing_legacy_id(monkeypatch):
    actor = make_actor()
    employee = SimpleNamespace(id=uuid.uuid4(), branch_id=uuid.uuid4())
    existing_payment = SimpleNamespace(
        tenant_id=actor.tenant_id,
        branch_id=employee.branch_id,
        employee_id=employee.id,
        legacy_id="PAY1",
        amount=Decimal("50"),
        payment_date=date(2026, 4, 18),
        recorded_at=None,
        note=None,
    )
    db = DummySession(existing_payment)
    payload = EmployeeSalaryPaymentInput(
        id="PAY1",
        amount=Decimal("125"),
        payment_date=date(2026, 4, 20),
        recorded_at="2026-04-20T10:00:00Z",
        note="advance",
    )

    monkeypatch.setattr(employees, "_get_employee_or_404", lambda *_args, **_kwargs: employee)

    saved = employees.create_employee_salary_payment(employee.id, payload, actor, db)

    assert saved is existing_payment
    assert db.added == []
    assert db.committed is True
    assert db.refreshed == [existing_payment]
    assert existing_payment.legacy_id == "PAY1"
    assert existing_payment.amount == Decimal("125")
    assert existing_payment.note == "advance"
