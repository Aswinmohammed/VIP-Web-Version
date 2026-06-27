from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import InventoryItem, MaterialSale, MaterialSaleItem
from backend.app.schemas import MaterialSaleCreate, MaterialSaleRead


router = APIRouter(prefix="/material-sales", tags=["material_sales"])


def _get_material_sale_or_404(db: Session, actor: AuthenticatedActor, sale_id: uuid.UUID) -> MaterialSale:
    stmt = apply_branch_scope(
        select(MaterialSale).options(selectinload(MaterialSale.items)).where(MaterialSale.id == sale_id),
        MaterialSale,
        actor,
    )
    sale = db.scalar(stmt)
    if not sale:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material sale not found")
    return sale


def _deduct_inventory_stock(db: Session, actor: AuthenticatedActor, items: list) -> None:
    """Deduct stock from inventory for each sale item. Raises 400 if insufficient stock."""
    from datetime import datetime
    for item_payload in items:
        if not item_payload.inventory_item_id:
            continue
        inv_item = db.scalar(
            apply_branch_scope(
                select(InventoryItem).where(InventoryItem.id == item_payload.inventory_item_id),
                InventoryItem,
                actor,
            ).with_for_update()
        )
        if inv_item is None:
            continue
        new_qty = inv_item.quantity - item_payload.quantity
        if new_qty < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for '{inv_item.name}'. Available: {inv_item.quantity}, requested: {item_payload.quantity}",
            )
        inv_item.quantity = new_qty
        inv_item.last_updated = datetime.utcnow()


def _restore_inventory_stock(db: Session, actor: AuthenticatedActor, sale_items: list) -> None:
    """Restore inventory stock when a sale is deleted."""
    from datetime import datetime
    for item in sale_items:
        if not item.inventory_item_id:
            continue
        inv_item = db.scalar(
            apply_branch_scope(
                select(InventoryItem).where(InventoryItem.id == item.inventory_item_id),
                InventoryItem,
                actor,
            ).with_for_update()
        )
        if inv_item is None:
            continue
        inv_item.quantity = inv_item.quantity + item.quantity
        inv_item.last_updated = datetime.utcnow()


def _replace_material_sale_items(db: Session, actor: AuthenticatedActor, sale: MaterialSale, payload: MaterialSaleCreate) -> None:
    for item in list(sale.items):
        db.delete(item)
    db.flush()

    for item_payload in payload.items:
        db.add(
            MaterialSaleItem(
                tenant_id=actor.tenant_id,
                branch_id=sale.branch_id,
                material_sale_id=sale.id,
                legacy_id=item_payload.id,
                inventory_item_id=item_payload.inventory_item_id,
                source_inventory_legacy_id=item_payload.source_inventory_legacy_id,
                category=item_payload.category,
                quantity=item_payload.quantity,
                unit_price=item_payload.unit_price,
                cost_price=item_payload.cost_price,
                amount=item_payload.amount,
            )
        )


@router.get("", response_model=list[MaterialSaleRead])
def list_material_sales(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[MaterialSale]:
    stmt = apply_branch_scope(
        select(MaterialSale)
        .options(selectinload(MaterialSale.items))
        .order_by(MaterialSale.sale_date.desc(), MaterialSale.created_at.desc()),
        MaterialSale,
        actor,
        branch_id,
    )
    return list(db.scalars(stmt))


@router.post("", response_model=MaterialSaleRead, status_code=status.HTTP_201_CREATED)
def create_material_sale(
    payload: MaterialSaleCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> MaterialSale:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    # Validate and deduct inventory stock before creating the sale
    _deduct_inventory_stock(db, actor, payload.items)

    sale = MaterialSale(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        sale_date=payload.sale_date,
        total_amount=payload.total_amount,
        discount=payload.discount,
        paid_amount=payload.paid_amount,
        payment_method=payload.payment_method,
        customer_name=payload.customer_name,
        status=payload.status,
    )
    db.add(sale)
    db.flush()
    _replace_material_sale_items(db, actor, sale, payload)
    db.commit()
    return _get_material_sale_or_404(db, actor, sale.id)


@router.put("/{sale_id}", response_model=MaterialSaleRead)
def update_material_sale(
    sale_id: uuid.UUID,
    payload: MaterialSaleCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> MaterialSale:
    sale = _get_material_sale_or_404(db, actor, sale_id)
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or sale.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    sale.branch_id = scoped_branch_id
    sale.sale_date = payload.sale_date
    sale.total_amount = payload.total_amount
    sale.discount = payload.discount
    sale.paid_amount = payload.paid_amount
    sale.payment_method = payload.payment_method
    sale.customer_name = payload.customer_name
    sale.status = payload.status
    _replace_material_sale_items(db, actor, sale, payload)
    db.commit()
    return _get_material_sale_or_404(db, actor, sale.id)


@router.delete("/{sale_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_material_sale(
    sale_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    sale = _get_material_sale_or_404(db, actor, sale_id)
    # Restore inventory stock when a sale is deleted
    _restore_inventory_stock(db, actor, list(sale.items))
    db.delete(sale)
    db.commit()
