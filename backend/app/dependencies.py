from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.app.core.config import get_settings
from backend.app.database import get_db
from backend.app.models import Branch, User, UserRole
from backend.app.security import JWTError, decode_token, validate_token_type
from backend.app.services.rls import set_rls_context


settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


class AuthenticatedActor(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    role: UserRole
    username: str

    @property
    def is_master_admin(self) -> bool:
        return self.role == UserRole.MASTER_ADMIN


def get_current_actor(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> AuthenticatedActor:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        validate_token_type(payload, "access")
        actor_id = uuid.UUID(payload["sub"])
        tenant_id = uuid.UUID(payload["tenant_id"])
    except (KeyError, ValueError, JWTError) as exc:
        raise unauthorized from exc

    user = db.scalar(select(User).where(User.id == actor_id, User.tenant_id == tenant_id, User.is_active.is_(True)))
    if not user:
        raise unauthorized

    is_hub = False
    if user.branch_id:
        branch = db.get(Branch, user.branch_id)
        if branch:
            is_hub = branch.is_production_hub

    actor = AuthenticatedActor(
        id=user.id,
        tenant_id=user.tenant_id,
        branch_id=user.branch_id,
        role=user.role,
        username=user.username,
    )
    set_rls_context(
        db,
        str(actor.tenant_id),
        actor.role.value,
        str(actor.branch_id) if actor.branch_id else None,
        is_production_hub=is_hub,
    )
    return actor


def require_master_admin(actor: AuthenticatedActor = Depends(get_current_actor)) -> AuthenticatedActor:
    if actor.role != UserRole.MASTER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Master admin access required")
    return actor


def resolve_branch_scope(actor: AuthenticatedActor, requested_branch_id: uuid.UUID | None) -> uuid.UUID | None:
    if actor.role == UserRole.BRANCH_ADMIN:
        if actor.branch_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch admin is missing a branch assignment")
        if requested_branch_id and requested_branch_id != actor.branch_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-branch access denied")
        return actor.branch_id
    return requested_branch_id


def ensure_branch_in_tenant(db: Session, tenant_id: uuid.UUID, branch_id: uuid.UUID) -> Branch:
    branch = db.scalar(select(Branch).where(Branch.id == branch_id, Branch.tenant_id == tenant_id))
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found in tenant")
    return branch


def apply_branch_scope(stmt: Select, model, actor: AuthenticatedActor, branch_id: uuid.UUID | None = None) -> Select:
    stmt = stmt.where(model.tenant_id == actor.tenant_id)
    scoped_branch_id = resolve_branch_scope(actor, branch_id)
    if scoped_branch_id is not None:
        stmt = stmt.where(model.branch_id == scoped_branch_id)
    return stmt
