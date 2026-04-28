import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from backend.app.api.routers import customers
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import UserRole


class DummySession:
    def __init__(self, scalar_results: list[object], commit_error: Exception | None = None) -> None:
        self.scalar_results = list(scalar_results)
        self.deleted: list[object] = []
        self.committed = False
        self.rollback_called = False
        self.commit_error = commit_error

    def scalar(self, _stmt):
        if not self.scalar_results:
            return None
        return self.scalar_results.pop(0)

    def delete(self, value) -> None:
        self.deleted.append(value)

    def commit(self) -> None:
        if self.commit_error is not None:
            raise self.commit_error
        self.committed = True

    def rollback(self) -> None:
        self.rollback_called = True


class DummyCustomer:
    def __init__(self, customer_id: uuid.UUID) -> None:
        self.id = customer_id


def make_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


def test_delete_customer_blocks_customers_with_orders(monkeypatch: pytest.MonkeyPatch) -> None:
    customer = DummyCustomer(uuid.uuid4())
    db = DummySession([customer, 1])
    actor = make_actor()

    monkeypatch.setattr(customers, "apply_branch_scope", lambda stmt, *_args, **_kwargs: stmt)

    with pytest.raises(HTTPException) as exc:
        customers.delete_customer(customer.id, actor, db)

    assert exc.value.status_code == 409
    assert exc.value.detail == "Cannot delete customer with existing orders. Delete the related orders first."
    assert db.deleted == []
    assert db.committed is False


def test_delete_customer_deletes_customer_without_orders(monkeypatch: pytest.MonkeyPatch) -> None:
    customer = DummyCustomer(uuid.uuid4())
    db = DummySession([customer, 0])
    actor = make_actor()

    monkeypatch.setattr(customers, "apply_branch_scope", lambda stmt, *_args, **_kwargs: stmt)

    customers.delete_customer(customer.id, actor, db)

    assert db.deleted == [customer]
    assert db.committed is True


def test_delete_customer_returns_conflict_when_integrity_error_occurs(monkeypatch: pytest.MonkeyPatch) -> None:
    customer = DummyCustomer(uuid.uuid4())
    db = DummySession(
        [customer, 0],
        commit_error=IntegrityError("DELETE FROM customers", {}, Exception("fk constraint")),
    )
    actor = make_actor()

    monkeypatch.setattr(customers, "apply_branch_scope", lambda stmt, *_args, **_kwargs: stmt)

    with pytest.raises(HTTPException) as exc:
        customers.delete_customer(customer.id, actor, db)

    assert exc.value.status_code == 409
    assert exc.value.detail == "Cannot delete customer with existing orders. Delete the related orders first."
    assert db.rollback_called is True
