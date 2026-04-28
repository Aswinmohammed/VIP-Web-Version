from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import Supplier, SupplierPayment, SupplierPurchase
from backend.app.schemas import SupplierCreate, SupplierRead


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
