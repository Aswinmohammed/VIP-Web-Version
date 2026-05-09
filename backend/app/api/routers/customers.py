from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, ensure_branch_in_tenant, get_current_actor, resolve_branch_scope
from backend.app.models import Branch, Customer, MeasurementSet, Order
from backend.app.schemas import CustomerCreate, CustomerRead, MeasurementSetRead
from backend.app.services.sms import normalize_phone_number


router = APIRouter(prefix="/customers", tags=["customers"])


def _has_production_access(db: Session, actor: AuthenticatedActor) -> bool:
    if actor.is_master_admin:
        return True
    if actor.branch_id is None:
        return False
    branch = db.scalar(select(Branch).where(Branch.id == actor.branch_id, Branch.tenant_id == actor.tenant_id))
    if not branch:
        return False
    return bool(branch.is_production_hub)


@router.get("", response_model=list[CustomerRead])
def list_customers(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[Customer]:
    stmt = select(Customer).order_by(Customer.name.asc())
    if _has_production_access(db, actor):
        stmt = stmt.where(Customer.tenant_id == actor.tenant_id)
        if branch_id is not None:
            stmt = stmt.where(Customer.branch_id == branch_id)
    else:
        stmt = apply_branch_scope(stmt, Customer, actor, branch_id)
    return list(db.scalars(stmt))


@router.post("", response_model=CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Customer:
    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    customer = Customer(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        name=payload.name,
        phone=payload.phone,
        phone_normalized=normalize_phone_number(payload.phone)[0],
        phone_valid=normalize_phone_number(payload.phone)[1],
        sms_opt_in=payload.sms_opt_in,
        marketing_opt_in=payload.marketing_opt_in,
        address=payload.address,
        email=payload.email,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.put("/{customer_id}", response_model=CustomerRead)
def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerCreate,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Customer:
    customer = db.scalar(apply_branch_scope(select(Customer).where(Customer.id == customer_id), Customer, actor))
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    scoped_branch_id = resolve_branch_scope(actor, payload.branch_id or customer.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)

    customer.branch_id = scoped_branch_id
    customer.name = payload.name
    customer.phone = payload.phone
    customer.phone_normalized, customer.phone_valid = normalize_phone_number(payload.phone)
    customer.sms_opt_in = payload.sms_opt_in
    customer.marketing_opt_in = payload.marketing_opt_in
    customer.address = payload.address
    customer.email = payload.email
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{customer_id}", response_model=CustomerRead)
def get_customer(customer_id: uuid.UUID, actor: AuthenticatedActor = Depends(get_current_actor), db: Session = Depends(get_db)) -> Customer:
    stmt = apply_branch_scope(select(Customer).where(Customer.id == customer_id), Customer, actor)
    customer = db.scalar(stmt)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    return customer


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(
    customer_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    customer = db.scalar(apply_branch_scope(select(Customer).where(Customer.id == customer_id), Customer, actor))
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")
    existing_order_count = int(
        db.scalar(
            select(func.count(Order.id)).where(
                Order.tenant_id == actor.tenant_id,
                Order.customer_id == customer.id,
            )
        )
        or 0
    )
    if existing_order_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete customer with existing orders. Delete the related orders first.",
        )

    db.delete(customer)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete customer with existing orders. Delete the related orders first.",
        ) from exc


@router.get("/{customer_id}/measurement-history", response_model=list[MeasurementSetRead])
def get_measurement_history(
    customer_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[MeasurementSet]:
    customer = db.scalar(apply_branch_scope(select(Customer).where(Customer.id == customer_id), Customer, actor))
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found")

    stmt = apply_branch_scope(
        select(MeasurementSet)
        .options(selectinload(MeasurementSet.values))
        .where(MeasurementSet.customer_id == customer_id)
        .order_by(MeasurementSet.captured_at.desc(), MeasurementSet.version_no.desc()),
        MeasurementSet,
        actor,
    )
    return list(db.scalars(stmt))
