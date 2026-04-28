from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, ensure_branch_in_tenant, require_master_admin
from backend.app.models import User, UserRole
from backend.app.schemas import UserCreate, UserRead, UserUpdate
from backend.app.security import hash_password


router = APIRouter(prefix="/users", tags=["users"])


def _get_user_or_404(db: Session, actor: AuthenticatedActor, user_id: uuid.UUID) -> User:
    user = db.scalar(select(User).where(User.id == user_id, User.tenant_id == actor.tenant_id))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user


@router.get("", response_model=list[UserRead])
def list_users(actor: AuthenticatedActor = Depends(require_master_admin), db: Session = Depends(get_db)) -> list[User]:
    stmt = select(User).where(User.tenant_id == actor.tenant_id).order_by(User.username.asc())
    return list(db.scalars(stmt))


@router.post("", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> User:
    if payload.role == UserRole.BRANCH_ADMIN and payload.branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch admin must be assigned to a branch")

    if payload.branch_id is not None:
        ensure_branch_in_tenant(db, actor.tenant_id, payload.branch_id)

    existing = db.scalar(select(User).where(User.tenant_id == actor.tenant_id, User.username == payload.username))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists in this tenant")

    user = User(
        tenant_id=actor.tenant_id,
        branch_id=payload.branch_id,
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserRead)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> User:
    user = _get_user_or_404(db, actor, user_id)

    if payload.role == UserRole.BRANCH_ADMIN and payload.branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Branch admin must be assigned to a branch")

    if payload.branch_id is not None:
        ensure_branch_in_tenant(db, actor.tenant_id, payload.branch_id)

    existing = db.scalar(
        select(User).where(
            User.tenant_id == actor.tenant_id,
            User.username == payload.username,
            User.id != user.id,
        )
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists in this tenant")

    user.username = payload.username
    user.role = payload.role
    user.branch_id = payload.branch_id
    user.is_active = payload.is_active
    if payload.password:
        user.password_hash = hash_password(payload.password)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> None:
    user = _get_user_or_404(db, actor, user_id)
    if user.id == actor.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
    db.delete(user)
    db.commit()
