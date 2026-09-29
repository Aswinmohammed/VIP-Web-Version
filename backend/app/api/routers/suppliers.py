from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import Supplier, SupplierCheque, SupplierPayment, SupplierPurchase
from backend.app.schemas import (
    SupplierChequeInput,
    SupplierChequeRead,
    SupplierChequeStatusUpdate,
    SupplierCreate,
    SupplierRead,
)


router = APIRouter(prefix="/suppliers", tags=["suppliers"])


def _get_supplier_or_404(db: Session, actor: AuthenticatedActor, supplier_id: uuid.UUID) -> Supplier:
    stmt = apply_branch_scope(
        select(Supplier)
        .options(selectinload(Supplier.purchases), selectinload(Supplier.payments))
        .where(Supplier.id == supplier_id),
        Supplier,
        actor,
    )
    supplier = db.scalar(stmt)
    if not supplier:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Supplier not found")
    return supplier


def _replace_supplier_children(db: Session, actor: AuthenticatedActor, supplier: Supplier, payload: SupplierCreate) -> None:
    for purchase in list(supplier.purchases):
        db.delete(purchase)
    for payment in list(supplier.payments):
        db.delete(payment)
    db.flush()

    for purchase_payload in payload.purchases:
        db.add(
            SupplierPurchase(
                tenant_id=actor.tenant_id,
                branch_id=supplier.branch_id,
                supplier_id=supplier.id,
                legacy_id=purchase_payload.id,
                description=purchase_payload.description,
                quantity=purchase_payload.quantity,
                unit_price=purchase_payload.unit_price,
                amount=purchase_payload.amount,
                purchase_date=purchase_payload.purchase_date,
                recorded_at=purchase_payload.recorded_at,
            )
        )

    for payment_payload in payload.payments:
        db.add(
            SupplierPayment(
                tenant_id=actor.tenant_id,
                branch_id=supplier.branch_id,
                supplier_id=supplier.id,
                legacy_id=payment_payload.id,
                amount=payment_payload.amount,
                payment_date=payment_payload.payment_date,
                method=payment_payload.method,
                recorded_at=payment_payload.recorded_at,
                note=payment_payload.note,
            )
        )


@router.get("", response_model=list[SupplierRead])
def list_suppliers(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[Supplier]:
    stmt = apply_branch_scope(
        select(Supplier)
        .options(selectinload(Supplier.purchases), selectinload(Supplier.payments))
        .order_by(Supplier.name.asc()),
        Supplier,
        actor,
        branch_id,
    )
    return list(db.scalars(stmt))


@router.post("", response_model=SupplierRead, status_code=status.HTTP_201_CREATED)
def create_supplier(
    payload: SupplierCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Supplier:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    supplier = Supplier(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        name=payload.name,
        phone=payload.phone,
        joined_date=payload.joined_date,
    )
    db.add(supplier)
    db.flush()
    _replace_supplier_children(db, actor, supplier, payload)
    db.commit()
    return _get_supplier_or_404(db, actor, supplier.id)


@router.put("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: uuid.UUID,
    payload: SupplierCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Supplier:
    supplier = _get_supplier_or_404(db, actor, supplier_id)
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or supplier.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    supplier.branch_id = scoped_branch_id
    supplier.name = payload.name
    supplier.phone = payload.phone
    supplier.joined_date = payload.joined_date
    _replace_supplier_children(db, actor, supplier, payload)
    db.commit()
    return _get_supplier_or_404(db, actor, supplier.id)


@router.delete("/{supplier_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier(
    supplier_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    supplier = _get_supplier_or_404(db, actor, supplier_id)
    db.delete(supplier)
    db.commit()


# Cheque Management Endpoints

def _get_cheque_or_404(db: Session, actor: AuthenticatedActor, cheque_id: uuid.UUID) -> SupplierCheque:
    stmt = apply_branch_scope(
        select(SupplierCheque).where(SupplierCheque.id == cheque_id),
        SupplierCheque,
        actor,
    )
    cheque = db.scalar(stmt)
    if not cheque:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cheque not found")
    return cheque


@router.get("/cheques", response_model=list[SupplierChequeRead])
def list_supplier_cheques(
    branch_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[SupplierCheque]:
    stmt = apply_branch_scope(
        select(SupplierCheque),
        SupplierCheque,
        actor,
        branch_id,
    )
    if from_date:
        stmt = stmt.where(SupplierCheque.cheque_date >= from_date)
    if to_date:
        stmt = stmt.where(SupplierCheque.cheque_date <= to_date)
    if status_filter:
        stmt = stmt.where(SupplierCheque.status == status_filter.lower())
    if search:
        search_pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                SupplierCheque.payee_name.ilike(search_pattern),
                SupplierCheque.cheque_number.ilike(search_pattern),
                SupplierCheque.note.ilike(search_pattern),
            )
        )
    stmt = stmt.order_by(SupplierCheque.cheque_date.desc(), SupplierCheque.created_at.desc())
    return list(db.scalars(stmt))


@router.post("/cheques", response_model=SupplierChequeRead, status_code=status.HTTP_201_CREATED)
def create_supplier_cheque(
    payload: SupplierChequeInput,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> SupplierCheque:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    status_val = payload.status.lower() if payload.status else "pending"
    cleared_at = payload.cleared_at
    if status_val == "paid" and not cleared_at:
        cleared_at = datetime.now(timezone.utc)

    cheque = SupplierCheque(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        supplier_id=payload.supplier_id,
        payee_name=payload.payee_name.strip(),
        cheque_number=payload.cheque_number.strip(),
        amount=payload.amount,
        cheque_date=payload.cheque_date,
        status=status_val,
        cleared_at=cleared_at,
        note=payload.note.strip() if payload.note else None,
        created_by=actor.id,
    )
    db.add(cheque)
    db.commit()
    db.refresh(cheque)
    return cheque


@router.put("/cheques/{cheque_id}", response_model=SupplierChequeRead)
def update_supplier_cheque(
    cheque_id: uuid.UUID,
    payload: SupplierChequeInput,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> SupplierCheque:
    cheque = _get_cheque_or_404(db, actor, cheque_id)
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or cheque.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    status_val = payload.status.lower() if payload.status else cheque.status
    cleared_at = payload.cleared_at
    if status_val == "paid" and not cleared_at:
        cleared_at = cheque.cleared_at or datetime.now(timezone.utc)
    elif status_val == "pending":
        cleared_at = None

    cheque.branch_id = scoped_branch_id
    cheque.supplier_id = payload.supplier_id
    cheque.payee_name = payload.payee_name.strip()
    cheque.cheque_number = payload.cheque_number.strip()
    cheque.amount = payload.amount
    cheque.cheque_date = payload.cheque_date
    cheque.status = status_val
    cheque.cleared_at = cleared_at
    cheque.note = payload.note.strip() if payload.note else None

    db.commit()
    db.refresh(cheque)
    return cheque


@router.patch("/cheques/{cheque_id}/status", response_model=SupplierChequeRead)
def update_supplier_cheque_status(
    cheque_id: uuid.UUID,
    payload: SupplierChequeStatusUpdate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> SupplierCheque:
    cheque = _get_cheque_or_404(db, actor, cheque_id)
    status_val = payload.status.lower().strip()
    if status_val not in ("pending", "paid"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status. Must be 'pending' or 'paid'.")

    cheque.status = status_val
    if status_val == "paid":
        cheque.cleared_at = payload.cleared_at or datetime.now(timezone.utc)
    else:
        cheque.cleared_at = None

    db.commit()
    db.refresh(cheque)
    return cheque


@router.delete("/cheques/{cheque_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_supplier_cheque(
    cheque_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    cheque = _get_cheque_or_404(db, actor, cheque_id)
    db.delete(cheque)
    db.commit()
