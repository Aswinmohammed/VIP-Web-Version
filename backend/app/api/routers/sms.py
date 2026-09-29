from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.database import SessionLocal, get_db
from backend.app.dependencies import AuthenticatedActor, get_current_actor, require_master_admin, resolve_branch_scope
from backend.app.models import Branch, Order, SmsCampaign, SmsCampaignStatus, SmsLog, SmsLogStatus, SmsSettings, SmsTemplate
from backend.app.schemas import (
    SmsAnalyticsRead,
    SmsBulkDueOrderSendRequest,
    SmsBulkDueOrderSendResponse,
    SmsBulkPackedOrderSendRequest,
    SmsBulkPackedOrderSendResponse,
    SmsCampaignCreate,
    SmsCampaignLaunchRequest,
    SmsCampaignRead,
    SmsCampaignPreviewRequest,
    SmsCampaignPreviewResponse,
    SmsDeliveryWebhookPayload,
    SmsLogRead,
    SmsManualSendRequest,
    SmsManualSendResponse,
    SmsOrderManualSendRequest,
    SmsSettingsRead,
    SmsSettingsUpdate,
    SmsTemplateRead,
    SmsTemplateUpdate,
)
from backend.app.services.sms import (
    build_due_order_manual_message,
    build_packed_order_manual_message,
    calculate_order_balance,
    create_campaign,
    dispatch_sms_logs_now,
    ensure_default_sms_templates,
    get_or_create_sms_settings,
    get_sms_template,
    launch_campaign,
    preview_campaign,
    record_manual_order_sms,
    record_manual_test_sms,
    update_sms_delivery_status,
)


router = APIRouter(prefix="/sms", tags=["sms"])


def _has_production_access(db: Session, actor: AuthenticatedActor) -> bool:
    if actor.role.value == "master_admin":
        return True
    if not actor.branch_id:
        return False
    branch = db.scalar(select(Branch).where(Branch.id == actor.branch_id, Branch.tenant_id == actor.tenant_id))
    return bool(branch and branch.is_production_hub)


def _campaign_scope_stmt(actor: AuthenticatedActor):
    stmt = select(SmsCampaign).where(SmsCampaign.tenant_id == actor.tenant_id)
    if actor.branch_id and actor.role.value == "branch_admin":
        stmt = stmt.where(SmsCampaign.branch_id == actor.branch_id)
    return stmt


def _log_scope_stmt(actor: AuthenticatedActor):
    stmt = select(SmsLog).where(SmsLog.tenant_id == actor.tenant_id)
    if actor.branch_id and actor.role.value == "branch_admin":
        stmt = stmt.where(SmsLog.branch_id == actor.branch_id)
    return stmt



def _dispatch_logs_in_background(log_ids: list[uuid.UUID]) -> None:
    if not log_ids:
        return
    with SessionLocal() as session:
        try:
            dispatch_sms_logs_now(session, log_ids)
            session.commit()
        except Exception:
            session.rollback()


def _dispatch_campaign_logs(db: Session, campaign_id: uuid.UUID) -> None:
    queued_log_ids = list(
        db.scalars(
            select(SmsLog.id).where(
                SmsLog.campaign_id == campaign_id,
                SmsLog.status == SmsLogStatus.QUEUED,
            )
        )
    )
    if queued_log_ids:
        dispatch_sms_logs_now(db, queued_log_ids)


def _get_sms_order_or_404(actor: AuthenticatedActor, db: Session, order_id: str | uuid.UUID) -> Order:
    parsed_uuid = None
    if isinstance(order_id, uuid.UUID):
        parsed_uuid = order_id
    else:
        try:
            parsed_uuid = uuid.UUID(str(order_id).strip())
        except (ValueError, TypeError, AttributeError):
            pass

    filter_cond = (Order.id == parsed_uuid) if parsed_uuid else (
        or_(Order.order_number == str(order_id).strip(), Order.legacy_id == str(order_id).strip())
    )

    stmt = (
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items),
            selectinload(Order.payments),
            selectinload(Order.branch_rel),
        )
        .where(
            Order.tenant_id == actor.tenant_id,
            filter_cond,
        )
    )
    if actor.branch_id and actor.role.value == "branch_admin" and not _has_production_access(db, actor):
        stmt = stmt.where(Order.branch_id == actor.branch_id)

    order = db.scalar(stmt)
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


@router.get("/settings", response_model=SmsSettingsRead)
def get_sms_settings(
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsSettings:
    return get_or_create_sms_settings(db, actor.tenant_id)


@router.put("/settings", response_model=SmsSettingsRead)
def update_sms_settings(
    payload: SmsSettingsUpdate,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsSettings:
    settings = get_or_create_sms_settings(db, actor.tenant_id)
    for field_name, value in payload.model_dump().items():
        setattr(settings, field_name, value)
    db.commit()
    db.refresh(settings)
    return settings


@router.get("/templates", response_model=list[SmsTemplateRead])
def list_sms_templates(
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> list[SmsTemplate]:
    scoped_branch_id = resolve_branch_scope(actor, branch_id)
    ensure_default_sms_templates(db, actor.tenant_id, actor.id)
    stmt = select(SmsTemplate).where(SmsTemplate.tenant_id == actor.tenant_id)
    if scoped_branch_id is None:
        stmt = stmt.where(SmsTemplate.branch_id.is_(None))
    else:
        stmt = stmt.where(SmsTemplate.branch_id == scoped_branch_id)
    stmt = stmt.order_by(SmsTemplate.category.asc(), SmsTemplate.name.asc())
    return list(db.scalars(stmt))


@router.put("/templates/{code}", response_model=SmsTemplateRead)
def upsert_sms_template(
    code: str,
    payload: SmsTemplateUpdate,
    branch_id: uuid.UUID | None = Query(default=None),
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsTemplate:
    scoped_branch_id = resolve_branch_scope(actor, branch_id)
    template = get_sms_template(db, actor.tenant_id, code, scoped_branch_id)

    if template is None or template.branch_id != scoped_branch_id:
        if payload.name is None or payload.category is None or payload.content is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="name, category, and content are required when creating a new template",
            )
        template = SmsTemplate(
            tenant_id=actor.tenant_id,
            branch_id=scoped_branch_id,
            code=code,
            name=payload.name,
            category=payload.category,
            trigger_event=payload.trigger_event,
            is_enabled=True if payload.is_enabled is None else payload.is_enabled,
            content=payload.content,
            variables_json=payload.variables_json or [],
            updated_by=actor.id,
        )
        db.add(template)
    else:
        update_data = payload.model_dump(exclude_unset=True)
        for field_name, value in update_data.items():
            setattr(template, field_name, value)
        template.updated_by = actor.id

    db.commit()
    db.refresh(template)
    return template


@router.post("/send-test", response_model=SmsManualSendResponse)
def send_test_sms(
    payload: SmsManualSendRequest,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsManualSendResponse:
    try:
        log = record_manual_test_sms(db, actor, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SmsManualSendResponse(
        status=log.status,
        phone_normalized=log.phone_normalized,
        provider_message_id=log.provider_message_id,
        segment_count=log.segment_count,
        estimated_cost=log.estimated_cost,
        message=log.error_message or "SMS test request processed.",
    )


@router.post("/send-order-message", response_model=SmsManualSendResponse)
def send_order_sms(
    payload: SmsOrderManualSendRequest,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> SmsManualSendResponse:
    order = _get_sms_order_or_404(actor, db, payload.order_id)
    try:
        log = record_manual_order_sms(db, actor, order, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    return SmsManualSendResponse(
        status=log.status,
        phone_normalized=log.phone_normalized,
        provider_message_id=log.provider_message_id,
        segment_count=log.segment_count,
        estimated_cost=log.estimated_cost,
        message=log.error_message or "Order SMS request processed.",
    )


@router.post("/send-packed-order-messages", response_model=SmsBulkPackedOrderSendResponse)
def send_packed_order_messages(
    payload: SmsBulkPackedOrderSendRequest,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
) -> SmsBulkPackedOrderSendResponse:
    order_ids_raw = list(dict.fromkeys(payload.order_ids))
    uuid_list: list[uuid.UUID] = []
    string_list: list[str] = []

    for oid in order_ids_raw:
        s = str(oid).strip()
        if not s:
            continue
        string_list.append(s)
        try:
            uuid_list.append(uuid.UUID(s))
        except (ValueError, TypeError, AttributeError):
            pass

    query_filters = []
    if uuid_list:
        query_filters.append(Order.id.in_(uuid_list))
    if string_list:
        query_filters.append(Order.order_number.in_(string_list))
        query_filters.append(Order.legacy_id.in_(string_list))

    if not query_filters:
        return SmsBulkPackedOrderSendResponse(
            total=0,
            sent=0,
            failed=0,
            skipped=0,
            message="No valid order IDs provided.",
        )

    stmt = (
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items),
            selectinload(Order.payments),
            selectinload(Order.branch_rel),
        )
        .where(
            Order.tenant_id == actor.tenant_id,
            or_(*query_filters),
        )
    )
    if actor.branch_id and actor.role.value == "branch_admin" and not _has_production_access(db, actor):
        stmt = stmt.where(Order.branch_id == actor.branch_id)

    orders_lookup: dict[str, Order] = {}
    for order in db.scalars(stmt):
        orders_lookup[str(order.id)] = order
        if order.order_number:
            orders_lookup[str(order.order_number)] = order
        if order.legacy_id:
            orders_lookup[str(order.legacy_id)] = order

    sent = 0
    failed = 0
    skipped = 0
    queued_log_ids: list[uuid.UUID] = []

    for raw_id in order_ids_raw:
        order = orders_lookup.get(str(raw_id).strip())
        if order is None:
            skipped += 1
            continue

        raw_status = order.status.value if hasattr(order.status, "value") else str(order.status)
        if raw_status != "Packed":
            skipped += 1
            continue

        customer = getattr(order, "customer", None)
        phone = customer.phone if customer is not None and customer.phone else ""
        if not phone.strip():
            skipped += 1
            continue

        try:
            message = build_packed_order_manual_message(order, customer)
            manual_payload = SimpleNamespace(phone=phone.strip(), message=message)
            log = record_manual_order_sms(
                db,
                actor,
                order,
                manual_payload,
                sms_type="packed_order_calling_list",
                trigger_event="packed_order_send",
                dispatch_now=False,
            )
            if log.status == SmsLogStatus.QUEUED:
                queued_log_ids.append(log.id)
                sent += 1
            elif log.status in {SmsLogStatus.SENT, SmsLogStatus.DELIVERED}:
                sent += 1
            elif log.status == SmsLogStatus.SKIPPED:
                skipped += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    db.commit()

    if queued_log_ids:
        if background_tasks is not None:
            background_tasks.add_task(_dispatch_logs_in_background, queued_log_ids)
        else:
            dispatch_sms_logs_now(db, queued_log_ids)

    failed_or_skipped = failed + skipped
    return SmsBulkPackedOrderSendResponse(
        total=len(order_ids_raw),
        sent=sent,
        failed=failed,
        skipped=skipped,
        message=f"Bulk SMS completed. Sent: {sent}. Failed/Skipped: {failed_or_skipped}.",
    )


@router.post("/send-due-order-messages", response_model=SmsBulkDueOrderSendResponse)
def send_due_order_messages(
    payload: SmsBulkDueOrderSendRequest,
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
) -> SmsBulkDueOrderSendResponse:
    order_ids_raw = list(dict.fromkeys(payload.order_ids))
    uuid_list: list[uuid.UUID] = []
    string_list: list[str] = []

    for oid in order_ids_raw:
        s = str(oid).strip()
        if not s:
            continue
        string_list.append(s)
        try:
            uuid_list.append(uuid.UUID(s))
        except (ValueError, TypeError, AttributeError):
            pass

    query_filters = []
    if uuid_list:
        query_filters.append(Order.id.in_(uuid_list))
    if string_list:
        query_filters.append(Order.order_number.in_(string_list))
        query_filters.append(Order.legacy_id.in_(string_list))

    if not query_filters:
        return SmsBulkDueOrderSendResponse(
            total=0,
            sent=0,
            failed=0,
            skipped=0,
            message="No valid order IDs provided.",
        )

    stmt = (
        select(Order)
        .options(
            selectinload(Order.customer),
            selectinload(Order.items),
            selectinload(Order.payments),
            selectinload(Order.branch_rel),
        )
        .where(
            Order.tenant_id == actor.tenant_id,
            or_(*query_filters),
        )
    )
    if actor.branch_id and actor.role.value == "branch_admin" and not _has_production_access(db, actor):
        stmt = stmt.where(Order.branch_id == actor.branch_id)

    orders_lookup: dict[str, Order] = {}
    for order in db.scalars(stmt):
        orders_lookup[str(order.id)] = order
        if order.order_number:
            orders_lookup[str(order.order_number)] = order
        if order.legacy_id:
            orders_lookup[str(order.legacy_id)] = order

    sent = 0
    failed = 0
    skipped = 0
    queued_log_ids: list[uuid.UUID] = []

    for raw_id in order_ids_raw:
        order = orders_lookup.get(str(raw_id).strip())
        if order is None:
            skipped += 1
            continue

        raw_status = order.status.value if hasattr(order.status, "value") else str(order.status)
        if raw_status != "Due" or calculate_order_balance(order) <= Decimal("0.00"):
            skipped += 1
            continue

        customer = getattr(order, "customer", None)
        phone = customer.phone if customer is not None and customer.phone else ""
        if not phone.strip():
            skipped += 1
            continue

        try:
            message = build_due_order_manual_message(order, customer)
            manual_payload = SimpleNamespace(phone=phone.strip(), message=message)
            log = record_manual_order_sms(
                db,
                actor,
                order,
                manual_payload,
                sms_type="due_order_reminder",
                trigger_event="due_order_send",
                dispatch_now=False,
            )
            if log.status == SmsLogStatus.QUEUED:
                queued_log_ids.append(log.id)
                sent += 1
            elif log.status in {SmsLogStatus.SENT, SmsLogStatus.DELIVERED}:
                sent += 1
            elif log.status == SmsLogStatus.SKIPPED:
                skipped += 1
            else:
                failed += 1
        except Exception:
            failed += 1

    db.commit()

    if queued_log_ids:
        if background_tasks is not None:
            background_tasks.add_task(_dispatch_logs_in_background, queued_log_ids)
        else:
            dispatch_sms_logs_now(db, queued_log_ids)

    failed_or_skipped = failed + skipped
    return SmsBulkDueOrderSendResponse(
        total=len(order_ids_raw),
        sent=sent,
        failed=failed,
        skipped=skipped,
        message=f"Due order SMS completed. Sent: {sent}. Failed/Skipped: {failed_or_skipped}.",
    )


@router.get("/logs", response_model=list[SmsLogRead])
def list_sms_logs(
    branch_id: uuid.UUID | None = Query(default=None),
    status_filter: SmsLogStatus | None = Query(default=None),
    campaign_id: uuid.UUID | None = Query(default=None),
    customer_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    actor: AuthenticatedActor = Depends(get_current_actor),
    db: Session = Depends(get_db),
) -> list[SmsLog]:
    stmt = _log_scope_stmt(actor)
    if branch_id is not None:
        stmt = stmt.where(SmsLog.branch_id == resolve_branch_scope(actor, branch_id))
    if status_filter is not None:
        stmt = stmt.where(SmsLog.status == status_filter)
    if campaign_id is not None:
        stmt = stmt.where(SmsLog.campaign_id == campaign_id)
    if customer_id is not None:
        stmt = stmt.where(SmsLog.customer_id == customer_id)
    stmt = stmt.order_by(SmsLog.created_at.desc()).limit(limit)
    return list(db.scalars(stmt))


@router.get("/analytics", response_model=SmsAnalyticsRead)
def get_sms_analytics(
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsAnalyticsRead:
    logs = list(db.scalars(_log_scope_stmt(actor)))
    today = date.today()
    month_start = today.replace(day=1)

    def _is_same_day(log: SmsLog) -> bool:
        return log.created_at.astimezone().date() == today

    def _is_this_month(log: SmsLog) -> bool:
        return log.created_at.astimezone().date() >= month_start

    queued_count = sum(1 for log in logs if log.status == SmsLogStatus.QUEUED)
    sent_today = sum(1 for log in logs if _is_same_day(log) and log.status in {SmsLogStatus.SENT, SmsLogStatus.DELIVERED})
    failed_today = sum(1 for log in logs if _is_same_day(log) and log.status == SmsLogStatus.FAILED)
    delivered_today = sum(1 for log in logs if _is_same_day(log) and log.status == SmsLogStatus.DELIVERED)
    sent_this_month = sum(1 for log in logs if _is_this_month(log) and log.status in {SmsLogStatus.SENT, SmsLogStatus.DELIVERED})
    estimated_cost_today = sum((Decimal(log.estimated_cost or 0) for log in logs if _is_same_day(log)), start=Decimal("0.00"))
    estimated_cost_this_month = sum((Decimal(log.estimated_cost or 0) for log in logs if _is_this_month(log)), start=Decimal("0.00"))

    return SmsAnalyticsRead(
        queued_count=queued_count,
        sent_today=sent_today,
        failed_today=failed_today,
        delivered_today=delivered_today,
        sent_this_month=sent_this_month,
        estimated_cost_today=estimated_cost_today.quantize(Decimal("0.01")),
        estimated_cost_this_month=estimated_cost_this_month.quantize(Decimal("0.01")),
    )


@router.get("/campaigns", response_model=list[SmsCampaignRead])
def list_campaigns(
    status_filter: SmsCampaignStatus | None = Query(default=None),
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> list[SmsCampaign]:
    stmt = _campaign_scope_stmt(actor).order_by(SmsCampaign.created_at.desc())
    if status_filter is not None:
        stmt = stmt.where(SmsCampaign.status == status_filter)
    return list(db.scalars(stmt))


@router.post("/campaigns/preview", response_model=SmsCampaignPreviewResponse)
def preview_sms_campaign(
    payload: SmsCampaignPreviewRequest,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsCampaignPreviewResponse:
    try:
        return preview_campaign(
            db,
            actor,
            template_code=payload.template_code,
            message_template=payload.message_template,
            filters=payload.filter,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/campaigns", response_model=SmsCampaignRead, status_code=status.HTTP_201_CREATED)
def create_sms_campaign(
    payload: SmsCampaignCreate,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsCampaign:
    try:
        campaign = create_campaign(db, actor, payload)
        if payload.scheduled_at is not None:
            launch_campaign(db, actor, campaign, payload.scheduled_at)
            _dispatch_campaign_logs(db, campaign.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/launch", response_model=SmsCampaignRead)
def launch_sms_campaign(
    campaign_id: uuid.UUID,
    payload: SmsCampaignLaunchRequest,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsCampaign:
    campaign = db.scalar(_campaign_scope_stmt(actor).where(SmsCampaign.id == campaign_id).options(selectinload(SmsCampaign.logs)))
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    try:
        launch_campaign(db, actor, campaign, payload.scheduled_at)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if payload.scheduled_at is None:
        _dispatch_campaign_logs(db, campaign.id)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/campaigns/{campaign_id}/cancel", response_model=SmsCampaignRead)
def cancel_sms_campaign(
    campaign_id: uuid.UUID,
    actor: AuthenticatedActor = Depends(require_master_admin),
    db: Session = Depends(get_db),
) -> SmsCampaign:
    campaign = db.scalar(_campaign_scope_stmt(actor).where(SmsCampaign.id == campaign_id).options(selectinload(SmsCampaign.logs)))
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")

    from backend.app.services.sms import cancel_campaign

    cancel_campaign(db, campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@router.post("/webhooks/{provider}/delivery", status_code=status.HTTP_202_ACCEPTED)
def sms_delivery_webhook(
    provider: str,
    payload: SmsDeliveryWebhookPayload,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    log = update_sms_delivery_status(
        db,
        provider_name=provider,
        provider_message_id=payload.provider_message_id,
        status=payload.status,
        error_message=payload.error_message,
    )
    db.commit()
    return {"status": "accepted", "matched": "true" if log else "false"}
