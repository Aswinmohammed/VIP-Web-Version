from __future__ import annotations

import uuid
from datetime import datetime
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import InventoryItem
from backend.app.schemas import InventoryItemCreate, InventoryItemRead


router = APIRouter(prefix="/inventory", tags=["inventory"])


_ITEM_CODE_SANITIZER = re.compile(r"[^A-Z0-9]+")


def _normalize_item_code(value: str | None, fallback_name: str) -> str:
    candidate = (value or fallback_name or "ITEM").strip().upper()
    normalized = _ITEM_CODE_SANITIZER.sub("-", candidate).strip("-")
    return normalized[:40] or f"ITEM-{uuid.uuid4().hex[:8].upper()}"


def _default_barcode_value(item_code: str) -> str:
    return item_code


def _get_inventory_item_or_404(db: Session, actor: AuthenticatedActor, item_id: uuid.UUID) -> InventoryItem:
    item = db.scalar(apply_branch_scope(select(InventoryItem).where(InventoryItem.id == item_id), InventoryItem, actor))
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


@router.get("", response_model=list[InventoryItemRead])
def list_inventory(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[InventoryItem]:
    stmt = apply_branch_scope(
        select(InventoryItem).order_by(InventoryItem.item_code.asc().nullslast(), InventoryItem.name.asc()),
        InventoryItem,
        actor,
        branch_id,
    )
    return list(db.scalars(stmt))


@router.post("", response_model=InventoryItemRead, status_code=status.HTTP_201_CREATED)
def create_inventory_item(
    payload: InventoryItemCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> InventoryItem:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    item = InventoryItem(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        item_code=_normalize_item_code(payload.item_code, payload.name),
        barcode_value=(payload.barcode_value or _default_barcode_value(_normalize_item_code(payload.item_code, payload.name))),
        name=payload.name,
        category=payload.category or "Material",
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        mrp=payload.mrp,
        wholesale_price=payload.wholesale_price,
        last_updated=payload.last_updated,
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

    item.branch_id = scoped_branch_id
    item.item_code = _normalize_item_code(payload.item_code, payload.name)
    item.barcode_value = payload.barcode_value or _default_barcode_value(item.item_code)
    item.name = payload.name
    item.category = payload.category or "Material"
    item.quantity = payload.quantity
    item.unit_price = payload.unit_price
    item.mrp = payload.mrp
    item.wholesale_price = payload.wholesale_price
    item.last_updated = payload.last_updated or datetime.utcnow()
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
