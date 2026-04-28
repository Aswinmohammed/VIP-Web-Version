from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, apply_branch_scope, get_current_actor, require_master_admin
from backend.app.models import Branch, Order
from backend.app.schemas import BranchSalesSummary, GlobalSalesResponse, SalesSummary


router = APIRouter(prefix="/reports", tags=["reports"])


def _summarize_orders(orders: list[Order]) -> SalesSummary:
    gross = Decimal("0.00")
    discount = Decimal("0.00")
    paid = Decimal("0.00")

    for order in orders:
        items_total = sum((Decimal(item.quantity) * Decimal(item.price_per_unit) for item in order.items), start=Decimal("0.00"))
        gross += items_total
        discount += Decimal(order.discount)
        paid += sum((Decimal(payment.amount) for payment in order.payments), start=Decimal("0.00"))

    net = gross - discount
    outstanding = net - paid
    return SalesSummary(
        order_count=len(orders),
        gross_amount=gross,
        discount_amount=discount,
        net_amount=net,
        paid_amount=paid,
        outstanding_amount=outstanding,
    )


def _get_filtered_orders(
    db: Session,
    actor: AuthenticatedActor,
    branch_id: uuid.UUID | None,
    from_date: date | None,
    to_date: date | None,
) -> list[Order]:
    stmt = select(Order).options(selectinload(Order.items), selectinload(Order.payments), selectinload(Order.customer))
    stmt = apply_branch_scope(stmt, Order, actor, branch_id)
    if from_date is not None:
        stmt = stmt.where(Order.order_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Order.order_date <= to_date)
    return list(db.scalars(stmt))


@router.get("/sales-summary", response_model=SalesSummary)
def sales_summary(
    branch_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> SalesSummary:
    orders = _get_filtered_orders(db, actor, branch_id, from_date, to_date)
    return _summarize_orders(orders)


@router.get("/global-sales", response_model=GlobalSalesResponse)
def global_sales(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> GlobalSalesResponse:
    orders = _get_filtered_orders(db, actor, None, from_date, to_date)
    branches = {branch.id: branch for branch in db.scalars(select(Branch).where(Branch.tenant_id == actor.tenant_id))}
    grouped: dict[uuid.UUID, list[Order]] = defaultdict(list)
    for order in orders:
        grouped[order.branch_id].append(order)

    by_branch: list[BranchSalesSummary] = []
    for branch_id, branch_orders in grouped.items():
        branch = branches.get(branch_id)
        if branch is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Branch data is inconsistent")
        summary = _summarize_orders(branch_orders)
        by_branch.append(
            BranchSalesSummary(
                branch_id=branch.id,
                branch_code=branch.code,
                branch_name=branch.name,
                order_count=summary.order_count,
                net_amount=summary.net_amount,
                paid_amount=summary.paid_amount,
                outstanding_amount=summary.outstanding_amount,
            )
        )

    return GlobalSalesResponse(
        tenant_id=actor.tenant_id,
        from_date=from_date,
        to_date=to_date,
        totals=_summarize_orders(orders),
        by_branch=sorted(by_branch, key=lambda row: row.branch_name.lower()),
    )
