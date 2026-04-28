import uuid

import pytest
from fastapi import HTTPException

from backend.app.api.routers import users
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import UserRole


class DummySession:
    def __init__(self) -> None:
        self.deleted = []
        self.committed = False

    def delete(self, value) -> None:
        self.deleted.append(value)

    def commit(self) -> None:
        self.committed = True


class DummyUser:
    def __init__(self, user_id: uuid.UUID) -> None:
        self.id = user_id


def make_actor(actor_id: uuid.UUID) -> AuthenticatedActor:
    return AuthenticatedActor(
        id=actor_id,
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


def test_delete_user_blocks_self_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    actor_id = uuid.uuid4()
    actor = make_actor(actor_id)
    db = DummySession()

    monkeypatch.setattr(users, "_get_user_or_404", lambda *_args, **_kwargs: DummyUser(actor_id))

    with pytest.raises(HTTPException) as exc:
        users.delete_user(actor_id, actor, db)

    assert exc.value.status_code == 400
    assert db.deleted == []
    assert db.committed is False


def test_delete_user_deletes_other_user(monkeypatch: pytest.MonkeyPatch) -> None:
    actor = make_actor(uuid.uuid4())
    target_id = uuid.uuid4()
    target_user = DummyUser(target_id)
    db = DummySession()

    monkeypatch.setattr(users, "_get_user_or_404", lambda *_args, **_kwargs: target_user)

    users.delete_user(target_id, actor, db)

    assert db.deleted == [target_user]
    assert db.committed is True
