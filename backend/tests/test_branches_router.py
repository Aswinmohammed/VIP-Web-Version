import uuid

from backend.app.api.routers import branches
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import UserRole


class DummySession:
    def __init__(self, branch) -> None:
        self.branch = branch
        self.deleted = []
        self.committed = False

    def get(self, model, branch_id):
        if self.branch and str(self.branch.id) == str(branch_id):
            return self.branch
        return None

    def delete(self, value) -> None:
        self.deleted.append(value)

    def commit(self) -> None:
        self.committed = True


class DummyBranch:
    def __init__(self, branch_id: uuid.UUID, tenant_id: uuid.UUID) -> None:
        self.id = branch_id
        self.tenant_id = tenant_id


def make_actor(tenant_id: uuid.UUID) -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


def test_delete_branch_removes_tenant_branch() -> None:
    tenant_id = uuid.uuid4()
    branch = DummyBranch(uuid.uuid4(), tenant_id)
    db = DummySession(branch)
    actor = make_actor(tenant_id)

    branches.delete_branch(str(branch.id), actor, db)

    assert db.deleted == [branch]
    assert db.committed is True
