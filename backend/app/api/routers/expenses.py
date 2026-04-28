from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import Expense
from backend.app.schemas import ExpenseCreate, ExpenseRead


router = APIRouter(prefix="/expenses", tags=["expenses"])


def _get_expense_or_404(db: Session, actor: AuthenticatedActor, expense_id: uuid.UUID) -> Expense:
    expense = db.scalar(apply_branch_scope(select(Expense).where(Expense.id == expense_id), Expense, actor))
    if not expense:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@router.get("", response_model=list[ExpenseRead])
def list_expenses(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[Expense]:
    stmt = apply_branch_scope(select(Expense).order_by(Expense.expense_date.desc(), Expense.created_at.desc()), Expense, actor, branch_id)
    return list(db.scalars(stmt))


@router.post("", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Expense:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    expense = Expense(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        description=payload.description,
        amount=payload.amount,
        expense_date=payload.expense_date,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.put("/{expense_id}", response_model=ExpenseRead)
def update_expense(
    expense_id: uuid.UUID,
    payload: ExpenseCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Expense:
    expense = _get_expense_or_404(db, actor, expense_id)
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or expense.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    expense.branch_id = scoped_branch_id
    expense.description = payload.description
    expense.amount = payload.amount
    expense.expense_date = payload.expense_date
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    expense = _get_expense_or_404(db, actor, expense_id)
    db.delete(expense)
    db.commit()
