from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import InventoryItem
from backend.app.schemas import InventoryItemCreate, InventoryItemRead


router = APIRouter(prefix="/inventory", tags=["inventory"])


_ITEM_CODE_SANITIZER = re.compile(r"[^A-Z0-9]+")


def _generate_fab_item_code(db: Session, tenant_id: uuid.UUID) -> str:
    """Generate sequential FABxxxx item codes (FAB0001, FAB0002, ...)."""
    last_code = db.scalar(
        select(func.max(InventoryItem.item_code))
        .where(
            InventoryItem.tenant_id == tenant_id,
            InventoryItem.item_code.like("FAB%"),
        )
    )
    if last_code and len(last_code) > 3 and last_code[3:].isdigit():
        next_num = int(last_code[3:]) + 1
    else:
        next_num = 1
    return f"FAB{next_num:04d}"


def _normalize_item_code(value: str | None, fallback_name: str) -> str:
    candidate = (value or fallback_name or "ITEM").strip().upper()
    normalized = _ITEM_CODE_SANITIZER.sub("-", candidate).strip("-")
    return normalized[:40] or f"ITEM-{uuid.uuid4().hex[:8].upper()}"


def _default_barcode_value(item_code: str) -> str:
    return item_code


def _get_inventory_item_or_404(db: Session, actor: AuthenticatedActor, item_id: uuid.UUID) -> InventoryItem:
    item = db.scalar(select(InventoryItem).where(InventoryItem.id == item_id, InventoryItem.tenant_id == actor.tenant_id))
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


@router.get("", response_model=list[InventoryItemRead])
def list_inventory(
    branch_id: uuid.UUID | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[InventoryItem]:
    stmt = select(InventoryItem).where(InventoryItem.tenant_id == actor.tenant_id).order_by(InventoryItem.item_code.asc().nullslast(), InventoryItem.name.asc())
    if is_active is not None:
        stmt = stmt.where(InventoryItem.is_active == is_active)
    return list(db.scalars(stmt))


@router.get("/search", response_model=list[InventoryItemRead])
def search_inventory(
    barcode: str | None = Query(default=None, min_length=1, max_length=120),
    item_code: str | None = Query(default=None, min_length=1, max_length=120),
    name: str | None = Query(default=None, min_length=1, max_length=120),
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[InventoryItem]:
    """Search inventory by barcode value, item code, or name (for scanner integration)."""
    stmt = select(InventoryItem).where(InventoryItem.tenant_id == actor.tenant_id).order_by(InventoryItem.item_code.asc().nullslast())
    if barcode:
        stmt = stmt.where(InventoryItem.barcode_value.ilike(f"%{barcode.strip()}%"))
    if item_code:
        stmt = stmt.where(InventoryItem.item_code.ilike(f"%{item_code.strip()}%"))
    if name:
        stmt = stmt.where(InventoryItem.name.ilike(f"%{name.strip()}%"))
    return list(db.scalars(stmt))


@router.post("", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
def create_inventory_item(
    payload: InventoryItemCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> InventoryItem:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        from backend.app.models import Branch
        first_branch = db.scalar(select(Branch).where(Branch.tenant_id == actor.tenant_id))
        if first_branch:
            scoped_branch_id = first_branch.id
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No branches found in tenant to assign inventory")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    # Use provided item_code if given, otherwise auto-generate FABxxxx
    if payload.item_code and payload.item_code.strip():
        item_code = _normalize_item_code(payload.item_code, payload.name)
    else:
        item_code = _generate_fab_item_code(db, actor.tenant_id)

    item = InventoryItem(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        item_code=item_code,
        barcode_value=(payload.barcode_value or _default_barcode_value(item_code)),
        name=payload.name,
        category=payload.category or "Material",
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        mrp=payload.mrp,
        wholesale_price=payload.wholesale_price,
        last_updated=payload.last_updated,
        is_active=payload.is_active,
    )
    if item.last_updated is None:
        item.last_updated = datetime.utcnow()
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{item_id}", response_model=InventoryItemRead)
def update_inventory_item(
    item_id: uuid.UUID,
    payload: InventoryItemCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> InventoryItem:
    item = _get_inventory_item_or_404(db, actor, item_id)
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or item.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    # Preserve existing FABxxxx code or normalize if provided
    if payload.item_code and payload.item_code.strip():
        item_code = _normalize_item_code(payload.item_code, payload.name)
    else:
        item_code = item.item_code or _generate_fab_item_code(db, actor.tenant_id)

    item.branch_id = scoped_branch_id
    item.item_code = item_code
    item.barcode_value = payload.barcode_value or _default_barcode_value(item_code)
    item.name = payload.name
    item.category = payload.category or "Material"
    item.quantity = payload.quantity
    item.unit_price = payload.unit_price
    item.mrp = payload.mrp
    item.wholesale_price = payload.wholesale_price
    item.last_updated = payload.last_updated or datetime.utcnow()
    item.is_active = payload.is_active
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{item_id}/adjust-stock", response_model=InventoryItemRead)
def adjust_inventory_stock(
    item_id: uuid.UUID,
    delta: Decimal = Query(..., description="Quantity delta: positive to add, negative to deduct"),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> InventoryItem:
    """Atomically adjust inventory stock by a delta amount. Use negative delta to deduct."""
    item = _get_inventory_item_or_404(db, actor, item_id)
    new_quantity = item.quantity + delta
    if new_quantity < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient stock. Available: {item.quantity}, requested deduction: {abs(delta)}",
        )
    item.quantity = new_quantity
    item.last_updated = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory_item(
    item_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    item = _get_inventory_item_or_404(db, actor, item_id)
    db.delete(item)
    db.commit()
