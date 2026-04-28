import uuid

import pytest
from fastapi import HTTPException

from backend.app.api.routers import sms
from backend.app.dependencies import AuthenticatedActor
from backend.app.models import UserRole
from backend.app.schemas import SmsManualSendRequest


def make_actor() -> AuthenticatedActor:
    return AuthenticatedActor(
        id=uuid.uuid4(),
        tenant_id=uuid.uuid4(),
        branch_id=None,
        role=UserRole.MASTER_ADMIN,
        username="admin",
    )


class DummySession:
    def commit(self) -> None:
        return None


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
