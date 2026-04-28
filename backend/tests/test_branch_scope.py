import uuid

import pytest
from fastapi import HTTPException

from backend.app.dependencies import AuthenticatedActor, resolve_branch_scope
from backend.app.models import UserRole


def make_actor(role: UserRole, branch_id: uuid.UUID | None) -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=branch_id,
        role=role,
        username="tester",
    )


def test_branch_admin_is_forced_to_own_branch() -> None:
    branch_id = uuid.uuid4()
    actor = make_actor(UserRole.BRANCH_ADMIN, branch_id)

    assert resolve_branch_scope(actor, None) == branch_id
    assert resolve_branch_scope(actor, branch_id) == branch_id


def test_branch_admin_cannot_request_other_branch() -> None:
    actor = make_actor(UserRole.BRANCH_ADMIN, uuid.uuid4())

    with pytest.raises(HTTPException) as exc:
        resolve_branch_scope(actor, uuid.uuid4())

    assert exc.value.status_code == 403


def test_master_admin_can_optionally_scope_branch() -> None:
    requested_branch_id = uuid.uuid4()
    actor = make_actor(UserRole.MASTER_ADMIN, None)

    assert resolve_branch_scope(actor, None) is None
    assert resolve_branch_scope(actor, requested_branch_id) == requested_branch_id
