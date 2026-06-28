from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.database import SessionLocal, get_db
from backend.app.dependencies import (
    AuthenticatedActor,
    apply_branch_scope,
    ensure_branch_in_tenant,
    get_current_actor,
    resolve_branch_scope,
)
from backend.app.models import Branch, Customer, InventoryItem, MeasurementSet, MeasurementValue, Order, OrderItem, OrderStatus, Payment
from backend.app.schemas import OrderCreate, OrderRead, OrderStatusUpdate, PaymentInput, PaymentRead, ProductionNotificationRead
from backend.app.services.pdf import render_invoice_pdf
from backend.app.services.sms import (
    dispatch_sms_logs_now,
    is_order_ready_status,
    queue_due_reminder_sms,
    queue_order_delivered_sms,
    queue_order_confirmation_sms,
    queue_payment_confirmation_sms,
    queue_order_ready_sms,
    queue_thank_you_sms,
)


router = APIRouter(prefix="/orders", tags=["orders"])
PRODUCTION_STATUSES = {OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED, OrderStatus.PACKED}
ORDER_STATUS_BY_NORMALIZED_VALUE = {
    status.value.strip().lower().replace("_", " "): status
    for status in OrderStatus
}
ORDER_STATUS_BY_NORMALIZED_VALUE.update({
    status.name.strip().lower().replace("_", " "): status
    for status in OrderStatus
})


def _dispatch_immediate_sms_logs(db: Session, logs: list[object | None]) -> None:
    log_ids = [getattr(log, "id", None) for log in logs if getattr(log, "id", None) is not None]
    if not log_ids:
        return
    dispatch_sms_logs_now(db, log_ids)
    db.commit()


def _dispatch_immediate_sms_logs_in_background(log_ids: list[uuid.UUID]) -> None:
    if not log_ids:
        return

    db = SessionLocal()
    try:
        dispatch_sms_logs_now(db, log_ids)
        db.commit()
    finally:
        db.close()


def _schedule_immediate_sms_dispatch(background_tasks: BackgroundTasks | None, logs: list[object | None]) -> None:
    log_ids = [getattr(log, "id", None) for log in logs if getattr(log, "id", None) is not None]
    if not log_ids:
        return

    if background_tasks is None:
        return

    background_tasks.add_task(_dispatch_immediate_sms_logs_in_background, log_ids)


def _build_measurement_legacy_id(source_id: str | None) -> str:
    base = (source_id or "MEAS").strip()[:80] or "MEAS"
    return f"{base}-{uuid.uuid4().hex}"


def _normalize_order_status_filter(value: str | OrderStatus | None) -> OrderStatus | None:
    if value is None or value == "":
        return None
    if isinstance(value, OrderStatus):
        return value
    normalized = value.strip().lower().replace("_", " ")
    status_value = ORDER_STATUS_BY_NORMALIZED_VALUE.get(normalized)
    if not status_value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported order status filter: {value}")
    return status_value


def _digits_only(value: str | None) -> str:
    return "".join(character for character in (value or "") if character.isdigit())


def _normalized_phone_expression(column):
    expression = func.coalesce(column, "")
    for character in (" ", "-", "(", ")", "+", "."):
        expression = func.replace(expression, character, "")
    return expression


def _has_production_access(db: Session, actor: AuthenticatedActor) -> bool:
    if actor.is_master_admin:
        return True
    if actor.branch_id is None:
        return False
    branch = db.scalar(select(Branch).where(Branch.id == actor.branch_id, Branch.tenant_id == actor.tenant_id))
    if not branch:
        return False
    return bool(branch.is_production_hub)


def _apply_order_scope(stmt, db: Session, actor: AuthenticatedActor, branch_id: uuid.UUID | None = None):
    stmt = stmt.where(Order.tenant_id == actor.tenant_id)
    if _has_production_access(db, actor):
        if branch_id is not None:
            stmt = stmt.where(Order.branch_id == branch_id)
        return stmt
    return apply_branch_scope(stmt, Order, actor, branch_id)


def _resolve_order_branch_id(db: Session, actor: AuthenticatedActor, requested_branch_id: uuid.UUID | None) -> uuid.UUID | None:
    if _has_production_access(db, actor):
        return requested_branch_id or actor.branch_id
    return resolve_branch_scope(actor, requested_branch_id)


def _get_order_or_404(db: Session, actor: AuthenticatedActor, order_id: uuid.UUID) -> Order:
    stmt = _apply_order_scope(
        select(Order)
        .execution_options(populate_existing=True)
        .options(
            selectinload(Order.items),
            selectinload(Order.payments),
            selectinload(Order.customer),
            selectinload(Order.branch_rel),
            selectinload(Order.measurement_sets).selectinload(MeasurementSet.values),
        )
        .where(Order.id == order_id),
        db,
        actor,
    )
    order = db.scalar(stmt)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


def _serialize_order(order: Order) -> dict:
    item_measurements: dict[uuid.UUID, list[dict]] = {}
    for measurement_set in order.measurement_sets:
        if measurement_set.order_item_id is None:
            continue
        item_measurements[measurement_set.order_item_id] = [
            {
                "id": value.id,
                "legacy_id": value.legacy_id,
                "name": value.name,
                "value": value.value,
                "sort_order": value.sort_order,
            }
            for value in sorted(measurement_set.values, key=lambda current: current.sort_order)
        ]

    return {
        "id": order.id,
        "tenant_id": order.tenant_id,
        "branch_id": order.branch_id,
        "branch_name": order.branch_rel.name if order.branch_rel else None,
        "branch_code": order.branch_rel.code if order.branch_rel else None,
        "branch_address": order.branch_rel.address if order.branch_rel else None,
        "branch_phone": order.branch_rel.phone if order.branch_rel else None,
        "legacy_id": order.legacy_id,
        "customer_id": order.customer_id,
        "customer_name": order.customer.name if order.customer else None,
        "customer_phone": order.customer.phone if order.customer else None,
        "order_number": order.order_number,
        "order_date": order.order_date,
        "due_date": order.due_date,
        "status": order.status,
        "discount": order.discount,
        "advance": order.advance,
        "emergency": order.emergency,
        "is_called": order.is_called,
        "called_timestamp": order.called_timestamp,
        "call_history": order.call_history,
        "bag_count": order.bag_count,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
        "items": [
            {
                "id": item.id,
                "legacy_id": item.legacy_id,
                "dress_type": item.dress_type,
                "inventory_item_id": item.inventory_item_id,
                "cloth_code": item.cloth_code,
                "cloth_name": item.cloth_name,
                "cloth_size": item.cloth_size,
                "stitch_fee": item.stitch_fee,
                "quantity": item.quantity,
                "price_per_unit": item.price_per_unit,
                "note": item.note,
                "is_cut": item.is_cut,
                "quality": item.quality,
                "completed_quantity": item.completed_quantity,
                "completion_data": item.completion_data,
                "completion_status": item.completion_status,
                "measurements": item_measurements.get(item.id, []),
            }
            for item in order.items
        ],
        "payments": [
            {
                "id": payment.id,
                "legacy_id": payment.legacy_id,
                "amount": payment.amount,
                "payment_date": payment.payment_date,
                "method": payment.method,
                "note": payment.note,
                "collector_user_id": payment.collector_user_id,
                "branch_id": payment.branch_id,
            }
            for payment in order.payments
        ],
    }


def _next_measurement_version(db: Session, customer_id: uuid.UUID, dress_type: str) -> int:
    max_version = db.scalar(
        select(func.max(MeasurementSet.version_no)).where(
            MeasurementSet.customer_id == customer_id,
            MeasurementSet.dress_type == dress_type,
        )
    )
    return int(max_version or 0) + 1


def _enforce_branch_status_policy(actor: AuthenticatedActor, branch: Branch, next_status: OrderStatus) -> None:
    if actor.is_master_admin:
        return
    if "orders" in (branch.access_areas or []):
        return
    if next_status in PRODUCTION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This branch can create orders, but production statuses are maintained by the main branch",
        )


def _create_measurement_snapshot(
    db: Session,
    actor: AuthenticatedActor,
    customer_id: uuid.UUID,
    branch_id: uuid.UUID,
    order: Order,
    order_item: OrderItem,
    measurements,
) -> None:
    if not measurements:
        return

    measurement_set = MeasurementSet(
        tenant_id=actor.tenant_id,
        branch_id=branch_id,
        customer_id=customer_id,
        order_id=order.id,
        order_item_id=order_item.id,
        dress_type=order_item.dress_type,
        version_no=_next_measurement_version(db, customer_id, order_item.dress_type),
        note=order_item.note,
        captured_at=datetime.now(timezone.utc),
    )
    db.add(measurement_set)
    db.flush()

    for index, measurement in enumerate(measurements):
        db.add(
            MeasurementValue(
                tenant_id=actor.tenant_id,
                branch_id=branch_id,
                measurement_set_id=measurement_set.id,
                legacy_id=_build_measurement_legacy_id(measurement.id),
                name=measurement.name,
                value=measurement.value,
                sort_order=measurement.sort_order if measurement.sort_order else index,
            )
        )


def _adjust_inventory_for_order_items(db: Session, actor: AuthenticatedActor, items: list[OrderItem], is_restore: bool = False) -> None:
    from decimal import Decimal
    for item in items:
        if item.inventory_item_id:
            inventory_item = db.scalar(
                select(InventoryItem).where(
                    InventoryItem.id == item.inventory_item_id,
                    InventoryItem.tenant_id == actor.tenant_id
                ).with_for_update()
            )
            if inventory_item:
                amount_to_adjust = Decimal(str(item.cloth_size or 1)) * Decimal(str(item.quantity))
                if is_restore:
                    inventory_item.quantity += amount_to_adjust
                else:
                    new_qty = inventory_item.quantity - amount_to_adjust
                    if new_qty < 0:
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail=f"Insufficient stock for '{inventory_item.name}'. Available: {inventory_item.quantity}, requested: {amount_to_adjust}",
                        )
                    inventory_item.quantity = new_qty

def _replace_order_payload(db: Session, actor: AuthenticatedActor, order: Order, payload: OrderCreate) -> None:
    scoped_branch_id = _resolve_order_branch_id(db, actor, payload.branch_id or order.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    branch = ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)
    _enforce_branch_status_policy(actor, branch, payload.status)

    customer_stmt = select(Customer).where(
        Customer.id == payload.customer_id,
        Customer.tenant_id == actor.tenant_id,
        Customer.branch_id == scoped_branch_id,
    )
    if not _has_production_access(db, actor):
        customer_stmt = apply_branch_scope(customer_stmt, Customer, actor, scoped_branch_id)
    customer = db.scalar(customer_stmt)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found in accessible branch")

    order.branch_id = scoped_branch_id
    order.customer_id = payload.customer_id
    order.order_number = payload.order_number or order.order_number
    order.order_date = payload.order_date
    order.due_date = payload.due_date
    order.status = payload.status
    order.discount = payload.discount
    order.advance = payload.advance
    order.emergency = payload.emergency
    order.is_called = payload.is_called
    order.called_timestamp = payload.called_timestamp
    order.call_history = payload.call_history
    order.bag_count = payload.bag_count

    for measurement_set in list(order.measurement_sets):
        db.delete(measurement_set)
    for payment in list(order.payments):
        db.delete(payment)
    for item in list(order.items):
        db.delete(item)
    db.flush()

    for item_payload in payload.items:
        order_item = OrderItem(
            tenant_id=actor.tenant_id,
            branch_id=scoped_branch_id,
            order_id=order.id,
            legacy_id=item_payload.id,
            dress_type=item_payload.dress_type,
            inventory_item_id=item_payload.inventory_item_id,
            cloth_code=item_payload.cloth_code,
            cloth_name=item_payload.cloth_name,
            cloth_size=item_payload.cloth_size,
            stitch_fee=item_payload.stitch_fee,
            quantity=item_payload.quantity,
            price_per_unit=item_payload.price_per_unit,
            note=item_payload.note,
            is_cut=item_payload.is_cut,
            quality=item_payload.quality,
            completed_quantity=item_payload.completed_quantity,
            completion_data=item_payload.completion_data,
            completion_status=item_payload.completion_status,
        )
        db.add(order_item)
        db.flush()
        _create_measurement_snapshot(db, actor, payload.customer_id, scoped_branch_id, order, order_item, item_payload.measurements)

    for payment_payload in payload.payments:
        db.add(
            Payment(
                tenant_id=actor.tenant_id,
                branch_id=scoped_branch_id,
                order_id=order.id,
                collector_user_id=actor.id,
                amount=payment_payload.amount,
                payment_date=payment_payload.payment_date,
                method=payment_payload.method,
                note=payment_payload.note,
            )
        )


@router.get("", response_model=list[OrderRead])
def list_orders(
    branch_id: uuid.UUID | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    customer_id: uuid.UUID | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=120),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int | None = Query(default=None, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[dict]:
    stmt = select(Order).options(
        selectinload(Order.items),
        selectinload(Order.payments),
        selectinload(Order.customer),
        selectinload(Order.branch_rel),
        selectinload(Order.measurement_sets).selectinload(MeasurementSet.values),
    ).order_by(
        Order.order_date.desc(),
        Order.created_at.desc(),
    )
    stmt = _apply_order_scope(stmt, db, actor, branch_id)
    normalized_status_filter = _normalize_order_status_filter(status_filter)
    if normalized_status_filter is not None:
        stmt = stmt.where(Order.status == normalized_status_filter)
    if customer_id is not None:
        stmt = stmt.where(Order.customer_id == customer_id)
    if from_date is not None:
        stmt = stmt.where(Order.order_date >= from_date)
    if to_date is not None:
        stmt = stmt.where(Order.order_date <= to_date)
    if search:
        search_text = search.strip()
        search_digits = _digits_only(search_text)
        customer_name_match = Customer.name.ilike(f"%{search_text}%")
        order_number_match = Order.order_number.ilike(f"%{search_text}%")
        search_conditions = [customer_name_match, order_number_match]
        if search_digits:
            normalized_phone = _normalized_phone_expression(Customer.phone)
            search_conditions.append(normalized_phone.ilike(f"%{search_digits}%"))
        stmt = stmt.join(Order.customer).where(or_(*search_conditions))
    if offset:
        stmt = stmt.offset(offset)
    if limit is not None:
        stmt = stmt.limit(limit)
    return [_serialize_order(order) for order in db.scalars(stmt)]


@router.get("/production-notifications", response_model=list[ProductionNotificationRead])
def list_production_notifications(
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[dict]:
    if actor.is_master_admin:
        current_branch = None
    else:
        if actor.branch_id is None:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Branch admin is missing a branch assignment")
        current_branch = ensure_branch_in_tenant(db, actor.tenant_id, actor.branch_id)
        if not current_branch.is_production_hub:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Production notifications are available only for production branches")

    latest_order_number = (
        select(Order.order_number)
        .where(
            Order.tenant_id == actor.tenant_id,
            Order.branch_id == Branch.id,
            Order.status == OrderStatus.PENDING,
        )
        .order_by(Order.created_at.desc())
        .limit(1)
        .correlate(Branch)
        .scalar_subquery()
    )

    stmt = (
        select(
            Branch.id.label("branch_id"),
            Branch.name.label("branch_name"),
            latest_order_number.label("latest_order_number"),
            func.count(Order.id).label("pending_count"),
        )
        .join(
            Order,
            Order.branch_id == Branch.id,
        )
        .where(
            Branch.tenant_id == actor.tenant_id,
            Branch.is_production_hub.is_(False),
            Order.tenant_id == actor.tenant_id,
            Order.status == OrderStatus.PENDING,
        )
        .group_by(Branch.id, Branch.name)
        .order_by(Branch.name.asc())
    )

    return [
        {
            "branch_id": row.branch_id,
            "branch_name": row.branch_name,
            "latest_order_number": row.latest_order_number,
            "count": row.pending_count,
        }
        for row in db.execute(stmt)
    ]


@router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    background_tasks: BackgroundTasks,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> dict:
    scoped_branch_id = _resolve_order_branch_id(db, actor, payload.branch_id)
    if scoped_branch_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="branch_id is required")
    branch = ensure_branch_in_tenant(db, actor.tenant_id, scoped_branch_id)
    _enforce_branch_status_policy(actor, branch, payload.status)

    customer_stmt = select(Customer).where(
        Customer.id == payload.customer_id,
        Customer.tenant_id == actor.tenant_id,
        Customer.branch_id == scoped_branch_id,
    )
    if not _has_production_access(db, actor):
        customer_stmt = apply_branch_scope(customer_stmt, Customer, actor, scoped_branch_id)
    customer = db.scalar(customer_stmt)
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customer not found in accessible branch")

    # Idempotency guard: if an order with this legacy_id already exists for this tenant, return it
    if payload.order_number:
        existing_order = db.scalar(
            _apply_order_scope(
                select(Order)
                .options(
                    selectinload(Order.items),
                    selectinload(Order.payments),
                    selectinload(Order.customer),
                    selectinload(Order.branch_rel),
                    selectinload(Order.measurement_sets).selectinload(MeasurementSet.values),
                )
                .where(Order.order_number == payload.order_number),
                db,
                actor,
            )
        )
        if existing_order is not None:
            return _serialize_order(existing_order)

    order = Order(
        tenant_id=actor.tenant_id,
        branch_id=scoped_branch_id,
        customer_id=payload.customer_id,
        order_number=payload.order_number or f"ORD-{int(datetime.now(timezone.utc).timestamp())}",
        order_date=payload.order_date,
        due_date=payload.due_date,
        status=payload.status,
        discount=payload.discount,
        advance=payload.advance,
        emergency=payload.emergency,
        is_called=payload.is_called,
        called_timestamp=payload.called_timestamp,
        call_history=payload.call_history,
        bag_count=payload.bag_count,
    )
    
    try:
        db.add(order)
        db.flush()
    except IntegrityError:
        db.rollback()
        # If we hit an integrity error on order_number + tenant_id, just return the existing one.
        if payload.order_number:
            existing_order = db.scalar(
                _apply_order_scope(
                    select(Order)
                    .options(
                        selectinload(Order.items),
                        selectinload(Order.payments),
                        selectinload(Order.customer),
                        selectinload(Order.branch_rel),
                        selectinload(Order.measurement_sets).selectinload(MeasurementSet.values),
                    )
                    .where(Order.order_number == payload.order_number),
                    db,
                    actor,
                )
            )
            if existing_order is not None:
                return _serialize_order(existing_order)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Order already exists")

    created_order_id = order.id

    for item_payload in payload.items:
        order_item = OrderItem(
            tenant_id=actor.tenant_id,
            branch_id=scoped_branch_id,
            order_id=order.id,
            dress_type=item_payload.dress_type,
            inventory_item_id=item_payload.inventory_item_id,
            cloth_code=item_payload.cloth_code,
            cloth_name=item_payload.cloth_name,
            cloth_size=item_payload.cloth_size,
            stitch_fee=item_payload.stitch_fee,
            quantity=item_payload.quantity,
            price_per_unit=item_payload.price_per_unit,
            note=item_payload.note,
            is_cut=item_payload.is_cut,
            quality=item_payload.quality,
            completed_quantity=item_payload.completed_quantity,
            completion_data=item_payload.completion_data,
            completion_status=item_payload.completion_status,
        )
        db.add(order_item)
        db.flush()
        _create_measurement_snapshot(db, actor, payload.customer_id, scoped_branch_id, order, order_item, item_payload.measurements)

    # Deduct inventory stock if order is not immediately Cancelled
    if payload.status != OrderStatus.CANCELLED:
        _adjust_inventory_for_order_items(db, actor, list(order.items), is_restore=False)

    for payment_payload in payload.payments:
        payment = Payment(
            tenant_id=actor.tenant_id,
            branch_id=scoped_branch_id,
            order_id=order.id,
            collector_user_id=actor.id,
            amount=payment_payload.amount,
            payment_date=payment_payload.payment_date,
            method=payment_payload.method,
            note=payment_payload.note,
        )
        db.add(payment)
        db.flush()
    db.commit()
    loaded_order = _get_order_or_404(db, actor, created_order_id)
    loaded_customer = loaded_order.customer
    if loaded_customer is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Customer relationship missing after order creation")
    queued_logs: list[object | None] = []
    if loaded_order.status != OrderStatus.HOLD:
        queued_logs.append(queue_order_confirmation_sms(db, loaded_order, loaded_customer))
        if is_order_ready_status(loaded_order.status):
            queued_logs.append(queue_order_ready_sms(db, loaded_order, loaded_customer))
        if loaded_order.status == OrderStatus.DUE:
            queued_logs.append(queue_due_reminder_sms(db, loaded_order, loaded_customer, reference_date=loaded_order.due_date or loaded_order.order_date))
        if loaded_order.status == OrderStatus.DELIVERED:
            queued_logs.append(queue_order_delivered_sms(db, loaded_order, loaded_customer))
        queued_logs.append(queue_thank_you_sms(db, loaded_order, loaded_customer))

    db.commit()
    _schedule_immediate_sms_dispatch(background_tasks, queued_logs)
    return _serialize_order(_get_order_or_404(db, actor, created_order_id))


@router.put("/{order_id}", response_model=OrderRead)
def update_order(
    order_id: uuid.UUID,
    payload: OrderCreate,
    background_tasks: BackgroundTasks,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> dict:
    order = _get_order_or_404(db, actor, order_id)
    previous_status = order.status
    old_items = list(order.items)
    
    # Restore stock for old items if order wasn't previously cancelled
    if previous_status != OrderStatus.CANCELLED:
        _adjust_inventory_for_order_items(db, actor, old_items, is_restore=True)

    _replace_order_payload(db, actor, order, payload)
    
    # Deduct stock for new items if order is not cancelled
    if payload.status != OrderStatus.CANCELLED:
        _adjust_inventory_for_order_items(db, actor, list(order.items), is_restore=False)
        
    db.commit()
    loaded_order = _get_order_or_404(db, actor, order_id)
    queued_logs: list[object | None] = []
    if not is_order_ready_status(previous_status) and is_order_ready_status(loaded_order.status) and loaded_order.customer is not None:
        queued_logs.append(queue_order_ready_sms(db, loaded_order, loaded_order.customer))
    if previous_status != OrderStatus.DUE and loaded_order.status == OrderStatus.DUE and loaded_order.customer is not None:
        queued_logs.append(queue_due_reminder_sms(db, loaded_order, loaded_order.customer, reference_date=loaded_order.due_date or loaded_order.order_date))
    if previous_status != OrderStatus.DELIVERED and loaded_order.status == OrderStatus.DELIVERED and loaded_order.customer is not None:
        queued_logs.append(queue_order_delivered_sms(db, loaded_order, loaded_order.customer))
    db.commit()
    _schedule_immediate_sms_dispatch(background_tasks, queued_logs)
    return _serialize_order(_get_order_or_404(db, actor, order.id))


@router.get("/{order_id}", response_model=OrderRead)
def get_order(order_id: uuid.UUID, actor: AuthenticatedActor = Depends(get_current_actor), db: Session = Depends(get_db)) -> dict:
    return _serialize_order(_get_order_or_404(db, actor, order_id))


@router.patch("/{order_id}/status", response_model=OrderRead)
def update_order_status(
    order_id: uuid.UUID,
    payload: OrderStatusUpdate,
    background_tasks: BackgroundTasks,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> dict:
    order = _get_order_or_404(db, actor, order_id)
    branch = ensure_branch_in_tenant(db, actor.tenant_id, order.branch_id)
    _enforce_branch_status_policy(actor, branch, payload.status)
    previous_status = order.status
    order.status = payload.status
    db.commit()
    current_order = _get_order_or_404(db, actor, order_id)
    queued_logs: list[object | None] = []
    if not is_order_ready_status(previous_status) and is_order_ready_status(current_order.status) and current_order.customer is not None:
        queued_logs.append(queue_order_ready_sms(db, current_order, current_order.customer))
    if previous_status != OrderStatus.DUE and current_order.status == OrderStatus.DUE and current_order.customer is not None:
        queued_logs.append(queue_due_reminder_sms(db, current_order, current_order.customer, reference_date=current_order.due_date or current_order.order_date))
    if previous_status != OrderStatus.DELIVERED and current_order.status == OrderStatus.DELIVERED and current_order.customer is not None:
        queued_logs.append(queue_order_delivered_sms(db, current_order, current_order.customer))
    db.commit()
    _schedule_immediate_sms_dispatch(background_tasks, queued_logs)
    return _serialize_order(_get_order_or_404(db, actor, order_id))


@router.post("/{order_id}/payments", response_model=PaymentRead, status_code=status.HTTP_201_CREATED)
def add_payment(
    order_id: uuid.UUID,
    payload: PaymentInput,
    background_tasks: BackgroundTasks,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> Payment:
    order = _get_order_or_404(db, actor, order_id)
    payment = Payment(
        tenant_id=actor.tenant_id,
        branch_id=order.branch_id,
        order_id=order.id,
        collector_user_id=actor.id,
        amount=payload.amount,
        payment_date=payload.payment_date,
        method=payload.method,
        note=payload.note,
    )
    db.add(payment)
    db.flush()
    db.commit()
    loaded_order = _get_order_or_404(db, actor, order_id)
    queued_logs: list[object | None] = []
    if loaded_order.customer is not None:
        persisted_payment = next((current_payment for current_payment in loaded_order.payments if current_payment.id == payment.id), payment)
        queued_logs.append(queue_payment_confirmation_sms(db, loaded_order, persisted_payment, loaded_order.customer))
        queued_logs.append(queue_thank_you_sms(db, loaded_order, loaded_order.customer))
    db.commit()
    _schedule_immediate_sms_dispatch(background_tasks, queued_logs)
    db.refresh(payment)
    return payment


@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_order(
    order_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> None:
    order = _get_order_or_404(db, actor, order_id)
    if order.status != OrderStatus.CANCELLED:
        _adjust_inventory_for_order_items(db, actor, list(order.items), is_restore=True)
    db.delete(order)
    db.commit()


@router.get("/{order_id}/invoice.pdf")
def download_invoice(order_id: uuid.UUID, actor: AuthenticatedActor = Depends(get_current_actor), db: Session = Depends(get_db)) -> Response:
    order = _get_order_or_404(db, actor, order_id)
    pdf_bytes = render_invoice_pdf(order, order.customer)
    headers = {"Content-Disposition": f'inline; filename="{order.order_number}.pdf"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)



