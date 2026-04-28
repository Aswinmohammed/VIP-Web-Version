from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, get_current_actor, require_master_admin
from backend.app.models import Branch
from backend.app.schemas import BranchCreate, BranchRead


router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchRead])
def list_branches(actor: AuthenticatedActor = Depends(get_current_actor), db: Session = Depends(get_db)) -> list[Branch]:
    stmt = select(Branch).where(Branch.tenant_id == actor.tenant_id).order_by(Branch.name.asc())
    if not actor.is_master_admin:
        if actor.branch_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch admin is missing a branch assignment")
        stmt = stmt.where(Branch.id == actor.branch_id)
    return list(db.scalars(stmt))


@router.post("", response_model=BranchRead, status_code=status.HTTP_201_CREATED)
def create_branch(
    payload: BranchCreate,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> Branch:
    existing = db.scalar(select(Branch).where(Branch.tenant_id == actor.tenant_id, Branch.code == payload.code))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Branch code already exists in this tenant")

    branch = Branch(tenant_id=actor.tenant_id, **payload.model_dump())
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.put("/{branch_id}", response_model=BranchRead)
def update_branch(
    branch_id: str,
    payload: BranchCreate,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> Branch:
    branch = db.get(Branch, branch_id)
    if not branch or branch.tenant_id != actor.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    existing = db.scalar(select(Branch).where(Branch.tenant_id == actor.tenant_id, Branch.code == payload.code, Branch.id != branch.id))
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Branch code already exists in this tenant")

    for key, value in payload.model_dump().items():
        setattr(branch, key, value)

    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.delete("/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(
    branch_id: str,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> None:
    branch = db.get(Branch, branch_id)
    if not branch or branch.tenant_id != actor.tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")

    db.delete(branch)
    db.commit()
