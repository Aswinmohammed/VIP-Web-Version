from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from backend.app.database import get_db
from backend.app.dependencies import AuthenticatedActor, require_master_admin, get_current_actor
from backend.app.models import Branch, Order, OrderItem, Payment
from backend.app.schemas import BranchSalesSummary, GlobalSalesResponse, SalesSummary


router = APIRouter(prefix="/reports", tags=["reports"])


def _calculate_sales_summary(
    db: Session,
    actor: AuthenticatedActor,
    branch_id: uuid.UUID | None,
    from_date: date | None,
    to_date: date | None,
) -> SalesSummary:
    # 1. Base query for order IDs and discounts matching the filters.
    # This matches the RLS and date filter rules.
    order_stmt = select(Order.id, Order.discount).where(Order.tenant_id == actor.tenant_id)
    
    # Resolve branch scope
    from backend.app.dependencies import resolve_branch_scope
    scoped_branch_id = resolve_branch_scope(actor, branch_id)
    if scoped_branch_id is not None:
        order_stmt = order_stmt.where(Order.branch_id == scoped_branch_id)
        
    if from_date is not None:
        order_stmt = order_stmt.where(Order.order_date >= from_date)
    if to_date is not None:
        order_stmt = order_stmt.where(Order.order_date <= to_date)
        
    # Get subquery representing matching orders
    matching_orders = order_stmt.subquery()
    
    # Aggregate order counts and discount sums
    order_metrics = db.execute(
        select(
            func.count(matching_orders.c.id),
            func.coalesce(func.sum(matching_orders.c.discount), 0)
        )
    ).first()
    
    order_count = order_metrics[0] if order_metrics else 0
    discount_amount = Decimal(str(order_metrics[1])) if order_metrics and order_metrics[1] is not None else Decimal("0.00")
    
    # Aggregate sum of gross from OrderItem (quantity * price_per_unit)
    gross_stmt = select(
        func.coalesce(func.sum(OrderItem.quantity * OrderItem.price_per_unit), 0)
    ).where(OrderItem.order_id.in_(select(matching_orders.c.id)))
    gross_amount = Decimal(str(db.scalar(gross_stmt) or 0))
    
    # Aggregate sum of paid from Payment
    paid_stmt = select(
        func.coalesce(func.sum(Payment.amount), 0)
    ).where(Payment.order_id.in_(select(matching_orders.c.id)))
    paid_amount = Decimal(str(db.scalar(paid_stmt) or 0))
    
    net_amount = gross_amount - discount_amount
    outstanding_amount = net_amount - paid_amount
    
    return SalesSummary(
        order_count=order_count,
        gross_amount=gross_amount,
        discount_amount=discount_amount,
        net_amount=net_amount,
        paid_amount=paid_amount,
        outstanding_amount=outstanding_amount,
    )


@router.get("/sales-summary", response_model=SalesSummary)
def sales_summary(
    branch_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> SalesSummary:
    return _calculate_sales_summary(db, actor, branch_id, from_date, to_date)


@router.get("/global-sales", response_model=GlobalSalesResponse)
def global_sales(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> GlobalSalesResponse:
    # Fetch all branches in tenant
    branches = {branch.id: branch for branch in db.scalars(select(Branch).where(Branch.tenant_id == actor.tenant_id))}
    
    # Aggregate 1: count of orders and sum of discount grouped by branch_id
    order_stmt = select(
        Order.branch_id,
        func.count(Order.id).label("order_count"),
        func.coalesce(func.sum(Order.discount), 0).label("discount")
    ).where(Order.tenant_id == actor.tenant_id)
    if from_date is not None:
        order_stmt = order_stmt.where(Order.order_date >= from_date)
    if to_date is not None:
        order_stmt = order_stmt.where(Order.order_date <= to_date)
    order_stmt = order_stmt.group_by(Order.branch_id)
    
    order_data = {row.branch_id: (row.order_count, Decimal(str(row.discount))) for row in db.execute(order_stmt)}
    
    # Aggregate 2: sum of gross grouped by branch_id
    gross_stmt = select(
        Order.branch_id,
        func.coalesce(func.sum(OrderItem.quantity * OrderItem.price_per_unit), 0).label("gross")
    ).join(OrderItem, OrderItem.order_id == Order.id).where(Order.tenant_id == actor.tenant_id)
    if from_date is not None:
        gross_stmt = gross_stmt.where(Order.order_date >= from_date)
    if to_date is not None:
        gross_stmt = gross_stmt.where(Order.order_date <= to_date)
    gross_stmt = gross_stmt.group_by(Order.branch_id)
    
    gross_data = {row.branch_id: Decimal(str(row.gross)) for row in db.execute(gross_stmt)}
    
    # Aggregate 3: sum of paid grouped by branch_id
    paid_stmt = select(
        Order.branch_id,
        func.coalesce(func.sum(Payment.amount), 0).label("paid")
    ).join(Payment, Payment.order_id == Order.id).where(Order.tenant_id == actor.tenant_id)
    if from_date is not None:
        paid_stmt = paid_stmt.where(Order.order_date >= from_date)
    if to_date is not None:
        paid_stmt = paid_stmt.where(Order.order_date <= to_date)
    paid_stmt = paid_stmt.group_by(Order.branch_id)
    
    paid_data = {row.branch_id: Decimal(str(row.paid)) for row in db.execute(paid_stmt)}
    
    by_branch: list[BranchSalesSummary] = []
    # Use union of keys from order_data, gross_data, paid_data to find all branches with sales activity
    active_branch_ids = set(order_data.keys()) | set(gross_data.keys()) | set(paid_data.keys())
    
    total_ocount = 0
    total_discount = Decimal("0.00")
    total_gross = Decimal("0.00")
    total_paid = Decimal("0.00")
    
    for branch_id in active_branch_ids:
        branch = branches.get(branch_id)
        if branch is None:
            continue
            
        ocount, disc = order_data.get(branch_id, (0, Decimal("0.00")))
        gross = gross_data.get(branch_id, Decimal("0.00"))
        paid = paid_data.get(branch_id, Decimal("0.00"))
        net = gross - disc
        outstanding = net - paid
        
        total_ocount += ocount
        total_discount += disc
        total_gross += gross
        total_paid += paid
        
        by_branch.append(
            BranchSalesSummary(
                branch_id=branch.id,
                branch_code=branch.code,
                branch_name=branch.name,
                order_count=ocount,
                net_amount=net,
                paid_amount=paid,
                outstanding_amount=outstanding,
            )
        )
        
    global_net = total_gross - total_discount
    global_outstanding = global_net - total_paid
    
    totals = SalesSummary(
        order_count=total_ocount,
        gross_amount=total_gross,
        discount_amount=total_discount,
        net_amount=global_net,
        paid_amount=total_paid,
        outstanding_amount=global_outstanding,
    )
    
    return GlobalSalesResponse(
        tenant_id=actor.tenant_id,
        from_date=from_date,
        to_date=to_date,
        totals=totals,
        by_branch=sorted(by_branch, key=lambda row: row.branch_name.lower()),
    )
