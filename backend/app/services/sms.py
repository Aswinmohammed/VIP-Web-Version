from __future__ import annotations

import json
import os
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any
from urllib import error, request

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from backend.app.models import (
    Branch,
    Customer,
    Order,
    OrderStatus,
    Payment,
    SmsCampaign,
    SmsCampaignStatus,
    SmsLog,
    SmsLogStatus,
    SmsSettings,
    SmsTemplate,
    SmsTemplateCategory,
)
from backend.app.schemas import SmsCampaignAudienceFilter, SmsCampaignPreviewRecipient, SmsCampaignPreviewResponse

if TYPE_CHECKING:
    from backend.app.dependencies import AuthenticatedActor
    from backend.app.schemas import SmsCampaignCreate, SmsCampaignLaunchRequest, SmsManualSendRequest, SmsOrderManualSendRequest


SMS_TEMPLATE_VARIABLES = ("Name", "OrderID", "Amount", "PaidAmount", "Balance", "Date", "BranchName", "BranchPhone")
READY_STATUS_VALUES = {"Packed", "Ready"}
SMS_RETRY_BACKOFF_MINUTES = (1, 5, 30)
_PLACEHOLDER_PATTERN = re.compile(r"\{([A-Za-z0-9_]+)\}")
_DIGITS_PATTERN = re.compile(r"\D+")
_ENV_FILE_PATHS = (".env",)
SMS_FOOTER_LINE = "Thank you - VIP Tailors & Fashion Pvt Ltd."
BRANCH_CONTACT_FALLBACK = "Contact branch directly"
OWNER_CONTACT_PHONE = "077 777 0811"
OWNER_CONTACT_INDENT = "                             "
INTECH_GATEWAY_BASE_URL = "https://sms.intechitsolutions.com/api/send"
INTECH_API_KEY_REFERENCE = "env:VIP_SMS_API_KEY"
INTECH_PROVIDER_NAME = "Intech SMS"


def _contact_details_block() -> str:
    return f"For More Details: {{BranchPhone}}\n{OWNER_CONTACT_INDENT}{OWNER_CONTACT_PHONE}"


ORDER_CONFIRMATION_TEMPLATE_CONTENT = (
    "Dear {Name}, your order {OrderID} has been placed successfully.\n"
    "Total: Rs.{Amount}.\n"
    "Paid now: Rs.{PaidAmount}.\n"
    "Balance: Rs.{Balance}.\n"
    "Due date: {Date}.\n"
    f"{_contact_details_block()}\n"
    f"{SMS_FOOTER_LINE}"
)

PAYMENT_CONFIRMATION_TEMPLATE_CONTENT = (
    "Dear {Name},\n"
    "Thank you for your payment of Rs.{Amount}.\n"
    "Your remaining balance is Rs.{Balance}.\n"
    "Order No: {OrderID}\n"
    "Thank you for choosing VIP Tailors."
)

DUE_REMINDER_TEMPLATE_CONTENT = (
    "Dear {Name}, your order {OrderID} is pending payment.\n"
    "Due amount: Rs.{Balance}.\n"
    "Due date: {Date}.\n"
    f"{_contact_details_block()}\n"
    f"{SMS_FOOTER_LINE}"
)

LEGACY_TEMPLATE_VARIANTS: dict[str, dict[str, set[str]]] = {
    "order_confirmation": {
        "names": {"Order Confirmation", "Order & Due Confirmation", "Order & Payment Confirmation"},
        "contents": {
            "Dear {Name}, your order {OrderID} has been placed successfully. Total: Rs.{Amount}. Due date: {Date}. Thank you - VIP Tailors",
            "Dear {Name}, your order {OrderID} has been placed successfully. Total: Rs.{Amount}. Due date: {Date}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} has been placed successfully. Total: Rs.{Amount}. Paid now: Rs.{PaidAmount}. Balance: Rs.{Balance}. Due date: {Date}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} has been placed successfully. Total: Rs.{Amount}. Paid now: Rs.{PaidAmount}. Balance: Rs.{Balance}. Due date: {Date}. Branch phone: {BranchPhone}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} has been placed successfully. \nTotal: Rs.{Amount}. \nPaid now: Rs.{PaidAmount}. \nBalance: Rs.{Balance}. \nDue date: {Date}.\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} has been placed successfully.\nTotal: Rs.{Amount}.\nPaid now: Rs.{PaidAmount}.\nBalance: Rs.{Balance}.\nDue date: {Date}.\nFor More Details: Branch Phone Number / {BranchPhone}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            f"Dear {{Name}}, your order {{OrderID}} has been placed successfully.\nTotal: Rs.{{Amount}}.\nPaid now: Rs.{{PaidAmount}}.\nBalance: Rs.{{Balance}}.\nDue date: {{Date}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            ORDER_CONFIRMATION_TEMPLATE_CONTENT,
        },
    },
    "order_ready": {
        "names": {"Order Ready"},
        "contents": {
            "Dear {Name}, your order {OrderID} is ready for pickup. Balance: Rs.{Balance}. Please collect soon - VIP Tailors",
            "Dear {Name}, your order {OrderID} is ready for pickup. Balance: Rs.{Balance}. Branch phone: {BranchPhone}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} is ready for pickup. \nBalance: Rs.{Balance}. Please collect soon \nVIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} is ready for pickup.\nBalance: Rs.{Balance}.\nFor More Details: Branch Phone Number / {BranchPhone}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            f"Dear {{Name}}, your order {{OrderID}} is ready for pickup.\nBalance: Rs.{{Balance}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
        },
    },
    "payment_confirmation": {
        "names": {"Payment Confirmation", "Additional Payment Confirmation"},
        "contents": {
            "Payment received for order {OrderID}. Amount: Rs.{Amount}. Remaining balance: Rs.{Balance}. Thank you",
            "Payment received for order {OrderID}. Paid amount: Rs.{Amount}. Remaining balance: Rs.{Balance}. Branch phone: {BranchPhone}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Payment received for order {OrderID}. Paid amount: Rs.{Amount}. Remaining balance: Rs.{Balance}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, payment received for order {OrderID}.\nPaid now: Rs.{Amount}.\nBalance: Rs.{Balance}.\nPayment date: {Date}.\nFor More Details: Branch Phone Number / {BranchPhone}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            f"Dear {{Name}}, payment received for order {{OrderID}}.\nPaid now: Rs.{{Amount}}.\nBalance: Rs.{{Balance}}.\nPayment date: {{Date}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            # Previous default content
            (
                "Dear {Name}, payment received for order {OrderID}.\n"
                "Paid now: Rs.{Amount}.\n"
                "Balance: Rs.{Balance}.\n"
                "Payment date: {Date}.\n"
                f"{_contact_details_block()}\n"
                f"{SMS_FOOTER_LINE}"
            ),
            PAYMENT_CONFIRMATION_TEMPLATE_CONTENT,
        },
    },
    "due_reminder": {
        "names": {"Due Reminder"},
        "contents": {
            "Reminder: Order {OrderID} is pending collection since {Date}. Balance: Rs.{Balance}. Please visit VIP Tailors",
            "Dear {Name}, your order {OrderID} is pending collection since {Date}. Balance: Rs.{Balance}. Branch phone: {BranchPhone}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} is pending collection \nsince {Date}. \nBalance: Rs.{Balance}.\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} is pending collection.\nDue amount: Rs.{Balance}.\nDue date: {Date}.\nFor More Details: Branch Phone Number / {BranchPhone}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            f"Dear {{Name}}, your order {{OrderID}} is pending payment.\nDue amount: Rs.{{Balance}}.\nDue date: {{Date}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            DUE_REMINDER_TEMPLATE_CONTENT,
        },
    },
    "order_delivered": {
        "names": {"Order Delivered"},
        "contents": {
            "Dear {Name}, your order {OrderID} has been delivered successfully on {Date}. Thank you for choosing VIP Tailors.",
            "Dear {Name}, your order {OrderID} has been delivered successfully on {Date}. Branch phone: {BranchPhone}.\n\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} has been delivered successfully \non {Date}. \nThank you for choosing VIP Tailors & Fashion Pvt Ltd.",
            "Dear {Name}, your order {OrderID} has been delivered successfully.\nDelivered date: {Date}.\nFor More Details: Branch Phone Number / {BranchPhone}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            f"Dear {{Name}}, your order {{OrderID}} has been delivered successfully.\nDelivered date: {{Date}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
        },
    },
    "thank_you": {
        "names": {"Thank You"},
        "contents": {
            "Thank you {Name}. Your order {OrderID} is fully paid. We appreciate your trust in VIP Tailors",
            "Thank you {Name}.\nYour order {OrderID} is fully paid. \nWe appreciate your trust in VIP Tailors.",
            "Dear {Name}, your order {OrderID} is fully paid.\nBalance: Rs.{Balance}.\nFor More Details: Branch Phone Number / {BranchPhone}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            f"Dear {{Name}}, your order {{OrderID}} is fully paid.\nBalance: Rs.{{Balance}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
            # New full-payment format
            (
                "Dear {Name},\n"
                "Thank you for your payment.\n"
                "Your order has been fully paid.\n"
                "Order No: {OrderID}\n"
                "Thank you for choosing VIP Tailors."
            ),
        },
    },
}


DEFAULT_SMS_TEMPLATES: tuple[dict[str, object], ...] = (
    {
        "code": "order_confirmation",
        "name": "Order + Initial Payment Confirmation",
        "category": SmsTemplateCategory.TRANSACTIONAL,
        "trigger_event": "order_created",
        "is_enabled": True,
        "content": ORDER_CONFIRMATION_TEMPLATE_CONTENT,
    },
    {
        "code": "order_ready",
        "name": "Order Ready",
        "category": SmsTemplateCategory.TRANSACTIONAL,
        "trigger_event": "order_ready",
        "is_enabled": True,
        "content": f"Dear {{Name}}, your order {{OrderID}} is ready for pickup.\nBalance: Rs.{{Balance}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
    },
    {
        "code": "due_reminder",
        "name": "Due Reminder",
        "category": SmsTemplateCategory.TRANSACTIONAL,
        "trigger_event": "due_reminder",
        "is_enabled": True,
        "content": DUE_REMINDER_TEMPLATE_CONTENT,
    },
    {
        "code": "order_delivered",
        "name": "Order Delivered",
        "category": SmsTemplateCategory.TRANSACTIONAL,
        "trigger_event": "order_delivered",
        "is_enabled": True,
        "content": f"Dear {{Name}}, your order {{OrderID}} has been delivered successfully.\nDelivered date: {{Date}}.\n{_contact_details_block()}\nThank you - VIP Tailors & Fashion Pvt Ltd.",
    },
    {
        "code": "payment_confirmation",
        "name": "Additional Payment Confirmation",
        "category": SmsTemplateCategory.TRANSACTIONAL,
        "trigger_event": "payment_recorded",
        "is_enabled": True,
        "content": PAYMENT_CONFIRMATION_TEMPLATE_CONTENT,
    },
    {
        "code": "thank_you",
        "name": "Thank You – Full Payment",
        "category": SmsTemplateCategory.TRANSACTIONAL,
        "trigger_event": "full_payment_completed",
        "is_enabled": True,
        "content": (
            "Dear {Name},\n"
            "Thank you for your payment.\n"
            "Your order has been fully paid.\n"
            "Order No: {OrderID}\n"
            "Thank you for choosing VIP Tailors."
        ),
    },
    {
        "code": "marketing_promo",
        "name": "Marketing Promo",
        "category": SmsTemplateCategory.MARKETING,
        "trigger_event": None,
        "is_enabled": True,
        "content": "Dear {Name}, visit VIP Tailors for our latest offers. We look forward to serving you again.",
    },
    {
        "code": "festival_eid",
        "name": "Festival Greeting - Eid",
        "category": SmsTemplateCategory.FESTIVAL,
        "trigger_event": None,
        "is_enabled": True,
        "content": "Eid Mubarak {Name}. Wishing you and your family peace, happiness, and blessings - VIP Tailors",
    },
    {
        "code": "festival_new_year",
        "name": "Festival Greeting - New Year",
        "category": SmsTemplateCategory.FESTIVAL,
        "trigger_event": None,
        "is_enabled": True,
        "content": "Happy New Year {Name}. Thank you for your support. We look forward to serving you in the year ahead - VIP Tailors",
    },
    {
        "code": "festival_seasonal",
        "name": "Festival Greeting - Seasonal",
        "category": SmsTemplateCategory.FESTIVAL,
        "trigger_event": None,
        "is_enabled": True,
        "content": "Warm wishes to you {Name} from VIP Tailors. Thank you for being a valued customer.",
    },
)


@dataclass
class CustomerAudienceMetrics:
    customer: Customer
    last_visit: date | None
    total_orders: int
    outstanding_balance: Decimal


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phone_number(phone: str | None) -> tuple[str | None, bool]:
    if not phone:
        return None, False

    digits = _DIGITS_PATTERN.sub("", phone)
    if not digits:
        return None, False

    if digits.startswith("0") and len(digits) == 10:
        digits = f"94{digits[1:]}"
    elif len(digits) == 9:
        digits = f"94{digits}"

    is_valid = digits.startswith("94") and len(digits) == 11
    return (digits if is_valid else None, is_valid)


def format_contact_phone(phone: str | None) -> str:
    if not phone:
        return BRANCH_CONTACT_FALLBACK

    digits = _DIGITS_PATTERN.sub("", phone)
    if digits.startswith("94") and len(digits) == 11:
        digits = f"0{digits[2:]}"
    elif len(digits) == 9:
        digits = f"0{digits}"

    if len(digits) == 10 and digits.startswith("0"):
        return f"{digits[:3]} {digits[3:6]} {digits[6:]}"

    cleaned = phone.strip()
    return cleaned or BRANCH_CONTACT_FALLBACK


def render_sms_template(template: str, variables: dict[str, object]) -> str:
    def _replace(match: re.Match[str]) -> str:
        key = match.group(1)
        value = variables.get(key, "")
        return str(value) if value is not None else ""

    rendered = _PLACEHOLDER_PATTERN.sub(_replace, template)
    normalized_lines: list[str] = []
    for line in rendered.replace("\r\n", "\n").split("\n"):
        if line.strip() == "":
            normalized_lines.append("")
            continue
        leading_whitespace_match = re.match(r"^[ \t\f\v]*", line)
        leading_whitespace = leading_whitespace_match.group(0) if leading_whitespace_match else ""
        body = line[len(leading_whitespace):].rstrip()
        normalized_body = re.sub(r"[ \t\f\v]+", " ", body).strip()
        normalized_lines.append(f"{leading_whitespace}{normalized_body}" if normalized_body else "")

    collapsed_lines: list[str] = []
    previous_blank = False
    for line in normalized_lines:
        is_blank = line == ""
        if is_blank and previous_blank:
            continue
        collapsed_lines.append(line)
        previous_blank = is_blank

    return "\n".join(collapsed_lines).strip()


def format_currency_for_sms(value: Decimal | int | float | str) -> str:
    return f"{Decimal(value):,.2f}"


def estimate_sms_segments(message: str) -> int:
    if not message:
        return 1
    is_ascii = all(ord(char) < 128 for char in message)
    segment_limit = 160 if is_ascii else 70
    return max(1, (len(message) + segment_limit - 1) // segment_limit)


def calculate_sms_cost(segment_count: int, cost_per_segment: Decimal) -> Decimal:
    return (Decimal(segment_count) * Decimal(cost_per_segment or 0)).quantize(Decimal("0.01"))


def is_order_ready_status(status: OrderStatus | str) -> bool:
    raw_status = status.value if isinstance(status, OrderStatus) else str(status)
    return raw_status in READY_STATUS_VALUES


def calculate_order_total(order: Order) -> Decimal:
    items_total = Decimal("0.00")
    for item in order.items:
        cloth_size_val = getattr(item, 'cloth_size', None)
        price_per_unit_val = getattr(item, 'price_per_unit', None)
        quantity_val = getattr(item, 'quantity', None)
        stitch_fee_val = getattr(item, 'stitch_fee', None)
        
        cloth_size = Decimal(cloth_size_val) if cloth_size_val is not None else Decimal("0.00")
        price_per_unit = Decimal(price_per_unit_val) if price_per_unit_val is not None else Decimal("0.00")
        quantity = Decimal(quantity_val) if quantity_val is not None else Decimal("1.00")
        stitch_fee = Decimal(stitch_fee_val) if stitch_fee_val is not None else Decimal("0.00")
        
        material_cost = cloth_size * price_per_unit * quantity
        stitch_cost = stitch_fee * quantity
        items_total += material_cost + stitch_cost

    return items_total - Decimal(order.discount or 0)


def calculate_paid_total(order: Order) -> Decimal:
    payments_total = sum((Decimal(payment.amount) for payment in order.payments), start=Decimal("0.00"))
    if payments_total > Decimal("0.00"):
        return payments_total
    return Decimal(order.advance or 0)


def calculate_order_balance(order: Order) -> Decimal:
    return max(Decimal("0.00"), calculate_order_total(order) - calculate_paid_total(order))


def get_or_create_sms_settings(db: Session, tenant_id) -> SmsSettings:
    settings = db.scalar(select(SmsSettings).where(SmsSettings.tenant_id == tenant_id))
    if settings:
        return settings

    settings = SmsSettings(
        tenant_id=tenant_id,
        provider_name=INTECH_PROVIDER_NAME,
        api_base_url=INTECH_GATEWAY_BASE_URL,
        api_key_ref=INTECH_API_KEY_REFERENCE,
        is_enabled=True,
        transactional_enabled=True,
        marketing_enabled=True,
        sender_id="VIP TAILORS"
    )
    db.add(settings)
    db.flush()
    return settings



def ensure_default_sms_templates(db: Session, tenant_id, actor_id=None) -> list[SmsTemplate]:
    existing_templates = list(
        db.scalars(
            select(SmsTemplate).where(
                SmsTemplate.tenant_id == tenant_id,
                SmsTemplate.branch_id.is_(None),
            )
        )
    )
    existing_by_code = {template.code: template for template in existing_templates}

    for definition in DEFAULT_SMS_TEMPLATES:
        code = str(definition["code"])
        existing_template = existing_by_code.get(code)
        if existing_template is not None:
            _sync_existing_default_template(existing_template, definition)
            continue
        template = SmsTemplate(
            tenant_id=tenant_id,
            branch_id=None,
            code=code,
            name=str(definition["name"]),
            category=definition["category"],
            trigger_event=definition["trigger_event"],
            is_enabled=bool(definition["is_enabled"]),
            content=str(definition["content"]),
            variables_json=list(SMS_TEMPLATE_VARIABLES),
            updated_by=actor_id,
        )
        db.add(template)
        existing_templates.append(template)

    db.flush()
    return existing_templates


def _sync_existing_default_template(template: SmsTemplate, definition: dict[str, object]) -> bool:
    legacy = LEGACY_TEMPLATE_VARIANTS.get(template.code)
    if legacy is None:
        return False

    has_legacy_name = template.name in legacy["names"]
    has_legacy_content = template.content in legacy["contents"]
    if not has_legacy_name and not has_legacy_content:
        return False

    if has_legacy_name:
        template.name = str(definition["name"])
    if has_legacy_content:
        template.content = str(definition["content"])
    serialized_variables = " ".join(template.variables_json or [])
    if not template.variables_json or any(variable not in serialized_variables for variable in SMS_TEMPLATE_VARIABLES):
        template.variables_json = list(SMS_TEMPLATE_VARIABLES)
    return True


def get_sms_template(db: Session, tenant_id, code: str, branch_id=None) -> SmsTemplate | None:
    ensure_default_sms_templates(db, tenant_id)

    if branch_id is not None:
        branch_template = db.scalar(
            select(SmsTemplate).where(
                SmsTemplate.tenant_id == tenant_id,
                SmsTemplate.branch_id == branch_id,
                SmsTemplate.code == code,
            )
        )
        if branch_template:
            return branch_template

    return db.scalar(
        select(SmsTemplate).where(
            SmsTemplate.tenant_id == tenant_id,
            SmsTemplate.branch_id.is_(None),
            SmsTemplate.code == code,
        )
    )


def _count_customer_sms_for_day(db: Session, tenant_id, customer_id, current_time: datetime) -> int:
    day_start = current_time.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    return int(
        db.scalar(
            select(func.count(SmsLog.id)).where(
                SmsLog.tenant_id == tenant_id,
                SmsLog.customer_id == customer_id,
                SmsLog.created_at >= day_start,
                SmsLog.created_at < day_end,
                SmsLog.status.in_(
                    [
                        SmsLogStatus.QUEUED,
                        SmsLogStatus.SENDING,
                        SmsLogStatus.SENT,
                        SmsLogStatus.DELIVERED,
                    ]
                ),
            )
        )
        or 0
    )


def _find_existing_log(db: Session, tenant_id, dedupe_key: str) -> SmsLog | None:
    return db.scalar(select(SmsLog).where(SmsLog.tenant_id == tenant_id, SmsLog.dedupe_key == dedupe_key))


def _parse_optional_time(value: str | None, fallback: time) -> time:
    if not value:
        return fallback
    hours, minutes = value.split(":", 1)
    return time(hour=int(hours), minute=int(minutes))


def next_allowed_marketing_time(settings: SmsSettings, current_time: datetime) -> datetime:
    quiet_start = _parse_optional_time(settings.quiet_hours_start, time(9, 0))
    quiet_end = _parse_optional_time(settings.quiet_hours_end, time(19, 0))
    current_local_time = current_time.timetz().replace(tzinfo=None)

    if quiet_start <= current_local_time <= quiet_end:
        return current_time

    next_time = current_time
    if current_local_time > quiet_end:
        next_time = current_time + timedelta(days=1)

    return next_time.replace(hour=quiet_start.hour, minute=quiet_start.minute, second=0, microsecond=0)


def _resolve_api_key(ref: str | None) -> str | None:
    if not ref:
        return None
    normalized_ref = ref.strip()
    if not normalized_ref:
        return None
    if normalized_ref.startswith("env:"):
        env_name = normalized_ref[4:].strip()
        if not env_name:
            return None
        env_value = os.getenv(env_name)
        if env_value:
            return env_value.strip()
        return _load_env_file_values().get(env_name)
    return normalized_ref


@lru_cache(maxsize=1)
def _load_env_file_values() -> dict[str, str]:
    project_root = Path(__file__).resolve().parents[3]
    values: dict[str, str] = {}
    for relative_path in _ENV_FILE_PATHS:
        env_path = project_root / relative_path
        if not env_path.exists():
            continue
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            normalized_key = key.replace("export ", "", 1).strip()
            normalized_value = value.strip()
            if (
                normalized_value
                and len(normalized_value) >= 2
                and normalized_value[0] == normalized_value[-1]
                and normalized_value[0] in {"'", '"'}
            ):
                normalized_value = normalized_value[1:-1]
            values[normalized_key] = normalized_value
    return values


def _uses_intech_gateway(settings: SmsSettings) -> bool:
    provider_name = (settings.provider_name or "").strip().lower()
    api_base_url = (settings.api_base_url or "").strip().lower()
    return "intech" in provider_name or "sms.intechitsolutions.com" in api_base_url


def _get_default_sms_branch_id(db: Session, tenant_id) -> Any | None:
    return db.scalar(
        select(Branch.id)
        .where(
            Branch.tenant_id == tenant_id,
            Branch.is_active.is_(True),
        )
        .order_by(Branch.is_production_hub.desc(), Branch.name.asc())
        .limit(1)
    )


def send_via_gateway(settings: SmsSettings, phone_normalized: str, message: str) -> tuple[str | None, dict[str, Any]]:
    if not settings.api_base_url:
        raise ValueError("SMS gateway URL is not configured.")

    headers = {"Content-Type": "application/json"}
    api_key = _resolve_api_key(settings.api_key_ref)
    if settings.api_key_ref and not api_key:
        raise ValueError(
            f"SMS API key reference '{settings.api_key_ref}' could not be resolved. "
            "Set the matching environment variable or update the SMS settings."
        )

    if _uses_intech_gateway(settings):
        payload = {
            "sender_id": settings.sender_id,
            "message": message,
            "recipients": [phone_normalized],
        }
        if api_key:
            headers["X-API-KEY"] = api_key
    else:
        payload = {
            "to": phone_normalized,
            "message": message,
            "sender_id": settings.sender_id,
        }
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

    req = request.Request(
        settings.api_base_url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=20) as response:
            response_body = response.read().decode("utf-8")
            parsed = json.loads(response_body) if response_body else {}
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8")
        raise RuntimeError(response_body or str(exc)) from exc

    provider_message_id = None
    for candidate_key in ("message_id", "id", "sid", "reference"):
        candidate_value = parsed.get(candidate_key)
        if candidate_value:
            provider_message_id = str(candidate_value)
            break

    return provider_message_id, parsed


def _build_order_variables(
    order: Order,
    customer: Customer,
    amount: Decimal | None = None,
    paid_amount: Decimal | None = None,
    current_date: date | None = None,
) -> dict[str, object]:
    balance = calculate_order_balance(order)
    effective_paid_amount = Decimal(paid_amount if paid_amount is not None else calculate_paid_total(order))
    message_date = current_date or order.due_date or order.order_date
    branch_name = (
        (order.branch_rel.name.strip() if getattr(order, "branch_rel", None) is not None and getattr(order.branch_rel, "name", None) else "")
        or (getattr(order, "branch_name", "") or "")
        or "Branch"
    )
    branch_phone = format_contact_phone(order.branch_rel.phone if getattr(order, "branch_rel", None) is not None else None)
    return {
        "Name": customer.name,
        "OrderID": order.order_number,
        "Amount": format_currency_for_sms(amount if amount is not None else calculate_order_total(order)),
        "PaidAmount": format_currency_for_sms(effective_paid_amount),
        "Balance": format_currency_for_sms(balance),
        "Date": message_date.isoformat() if isinstance(message_date, date) else "",
        "BranchName": branch_name,
        "BranchPhone": branch_phone,
    }


def queue_sms_message(
    db: Session,
    *,
    tenant_id,
    branch_id,
    customer: Customer | None,
    phone: str | None,
    message_body: str,
    sms_type: str,
    trigger_event: str | None,
    dedupe_key: str,
    template: SmsTemplate | None = None,
    order: Order | None = None,
    payment: Payment | None = None,
    campaign: SmsCampaign | None = None,
    scheduled_at: datetime | None = None,
    marketing: bool = False,
) -> SmsLog:
    existing = _find_existing_log(db, tenant_id, dedupe_key)
    if existing:
        return existing

    settings = get_or_create_sms_settings(db, tenant_id)
    normalized_phone, is_valid_phone = normalize_phone_number(phone)
    if customer is not None:
        customer.phone_normalized = normalized_phone
        customer.phone_valid = is_valid_phone

    status = SmsLogStatus.QUEUED
    error_message = None

    if not settings.is_enabled:
        status = SmsLogStatus.SKIPPED
        error_message = "SMS module is disabled."
    elif marketing and not settings.marketing_enabled:
        status = SmsLogStatus.SKIPPED
        error_message = "Marketing SMS is disabled."
    elif not marketing and not settings.transactional_enabled:
        status = SmsLogStatus.SKIPPED
        error_message = "Transactional SMS is disabled."
    elif not is_valid_phone:
        status = SmsLogStatus.SKIPPED
        error_message = "Invalid customer phone number."
    elif customer is not None and marketing and not customer.marketing_opt_in:
        status = SmsLogStatus.SKIPPED
        error_message = "Customer has opted out of marketing SMS."
    elif customer is not None and not marketing and not customer.sms_opt_in:
        status = SmsLogStatus.SKIPPED
        error_message = "Customer has opted out of transactional SMS."
    elif customer is not None and _count_customer_sms_for_day(db, tenant_id, customer.id, utc_now()) >= settings.daily_sms_limit:
        status = SmsLogStatus.SKIPPED
        error_message = "Daily SMS limit reached for customer."

    effective_schedule = scheduled_at
    if marketing and status == SmsLogStatus.QUEUED:
        effective_schedule = next_allowed_marketing_time(settings, scheduled_at or utc_now())

    segment_count = estimate_sms_segments(message_body)
    estimated_cost = calculate_sms_cost(segment_count, settings.cost_per_segment)
    log = SmsLog(
        tenant_id=tenant_id,
        branch_id=branch_id,
        customer_id=customer.id if customer else None,
        order_id=order.id if order else None,
        payment_id=payment.id if payment else None,
        campaign_id=campaign.id if campaign else None,
        template_id=template.id if template else None,
        sms_type=sms_type,
        trigger_event=trigger_event,
        dedupe_key=dedupe_key,
        phone_raw=phone,
        phone_normalized=normalized_phone,
        message_body=message_body,
        status=status,
        provider_name=settings.provider_name,
        segment_count=segment_count,
        estimated_cost=estimated_cost,
        actual_cost=Decimal("0.00"),
        retry_count=0,
        error_message=error_message,
        scheduled_at=effective_schedule,
    )
    db.add(log)
    db.flush()
    return log


def queue_transactional_sms(
    db: Session,
    *,
    tenant_id,
    branch_id,
    template_code: str,
    dedupe_key: str,
    customer: Customer,
    order: Order | None = None,
    payment: Payment | None = None,
    variables: dict[str, object],
) -> SmsLog | None:
    template = get_sms_template(db, tenant_id, template_code, branch_id)
    if template is None:
        ensure_default_sms_templates(db, tenant_id)
        template = get_sms_template(db, tenant_id, template_code, branch_id)
    if template is None or not template.is_enabled:
        return None

    message_body = render_sms_template(template.content, variables)
    return queue_sms_message(
        db,
        tenant_id=tenant_id,
        branch_id=branch_id,
        customer=customer,
        phone=customer.phone,
        message_body=message_body,
        sms_type=template.code,
        trigger_event=template.trigger_event,
        dedupe_key=dedupe_key,
        template=template,
        order=order,
        payment=payment,
        marketing=False,
    )


def queue_order_confirmation_sms(db: Session, order: Order, customer: Customer) -> SmsLog | None:
    return queue_transactional_sms(
        db,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        template_code="order_confirmation",
        dedupe_key=f"order_confirmation:{order.id}",
        customer=customer,
        order=order,
        variables=_build_order_variables(order, customer),
    )


def queue_order_ready_sms(db: Session, order: Order, customer: Customer) -> SmsLog | None:
    if not is_order_ready_status(order.status):
        return None

    return queue_transactional_sms(
        db,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        template_code="order_ready",
        dedupe_key=f"order_ready:{order.id}:{order.status.value if isinstance(order.status, OrderStatus) else order.status}",
        customer=customer,
        order=order,
        variables=_build_order_variables(order, customer),
    )


def queue_payment_confirmation_sms(db: Session, order: Order, payment: Payment, customer: Customer) -> SmsLog | None:
    return queue_transactional_sms(
        db,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        template_code="payment_confirmation",
        dedupe_key=f"payment_confirmation:{payment.id}",
        customer=customer,
        order=order,
        payment=payment,
        variables=_build_order_variables(order, customer, amount=Decimal(payment.amount), current_date=payment.payment_date),
    )


def queue_thank_you_sms(db: Session, order: Order, customer: Customer) -> SmsLog | None:
    if calculate_order_balance(order) > Decimal("0.00"):
        return None

    return queue_transactional_sms(
        db,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        template_code="thank_you",
        dedupe_key=f"thank_you:{order.id}",
        customer=customer,
        order=order,
        variables=_build_order_variables(order, customer),
    )


def queue_due_reminder_sms(
    db: Session,
    order: Order,
    customer: Customer,
    *,
    reference_date: date | None = None,
) -> SmsLog | None:
    effective_date = reference_date or date.today()
    return queue_transactional_sms(
        db,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        template_code="due_reminder",
        dedupe_key=f"due_reminder:{order.id}:{effective_date.isoformat()}",
        customer=customer,
        order=order,
        variables=_build_order_variables(order, customer, current_date=order.due_date or effective_date),
    )


def queue_order_delivered_sms(
    db: Session,
    order: Order,
    customer: Customer,
    *,
    delivered_date: date | None = None,
) -> SmsLog | None:
    return queue_transactional_sms(
        db,
        tenant_id=order.tenant_id,
        branch_id=order.branch_id,
        template_code="order_delivered",
        dedupe_key=f"order_delivered:{order.id}",
        customer=customer,
        order=order,
        variables=_build_order_variables(order, customer, current_date=delivered_date or date.today()),
    )


def _summarize_customer_metrics(customer: Customer) -> CustomerAudienceMetrics:
    last_visit = max((order.order_date for order in customer.orders), default=None)
    outstanding_balance = sum((calculate_order_balance(order) for order in customer.orders), start=Decimal("0.00"))
    return CustomerAudienceMetrics(
        customer=customer,
        last_visit=last_visit,
        total_orders=len(customer.orders),
        outstanding_balance=outstanding_balance,
    )


def build_campaign_audience(
    db: Session,
    actor: "AuthenticatedActor",
    filters: SmsCampaignAudienceFilter,
    settings: SmsSettings,
) -> list[CustomerAudienceMetrics]:
    scoped_branch_id = actor.branch_id if actor.branch_id and actor.role.value == "branch_admin" else filters.branch_id

    stmt = select(Customer).options(
        selectinload(Customer.orders).selectinload(Order.items),
        selectinload(Customer.orders).selectinload(Order.payments),
    ).where(Customer.tenant_id == actor.tenant_id)
    if scoped_branch_id is not None:
        stmt = stmt.where(Customer.branch_id == scoped_branch_id)

    customers = list(db.scalars(stmt))
    metrics_list: list[CustomerAudienceMetrics] = []
    inactive_cutoff = date.today() - timedelta(days=settings.inactive_customer_days)

    for customer in customers:
        normalized_phone, is_valid_phone = normalize_phone_number(customer.phone)
        customer.phone_normalized = normalized_phone
        customer.phone_valid = is_valid_phone
        metrics = _summarize_customer_metrics(customer)

        if not customer.marketing_opt_in or not is_valid_phone:
            continue
        if not filters.include_inactive and (metrics.last_visit is None or metrics.last_visit < inactive_cutoff):
            continue
        if filters.last_visit_from and (metrics.last_visit is None or metrics.last_visit < filters.last_visit_from):
            continue
        if filters.last_visit_to and (metrics.last_visit is None or metrics.last_visit > filters.last_visit_to):
            continue
        if filters.total_orders_min is not None and metrics.total_orders < filters.total_orders_min:
            continue
        if filters.outstanding_balance_min is not None and metrics.outstanding_balance < filters.outstanding_balance_min:
            continue

        metrics_list.append(metrics)

    return metrics_list


def _build_marketing_variables(metrics: CustomerAudienceMetrics) -> dict[str, object]:
    return {
        "Name": metrics.customer.name,
        "OrderID": "",
        "Amount": format_currency_for_sms(Decimal("0.00")),
        "PaidAmount": format_currency_for_sms(Decimal("0.00")),
        "Balance": format_currency_for_sms(metrics.outstanding_balance),
        "Date": metrics.last_visit.isoformat() if metrics.last_visit else "",
        "BranchName": "",
        "BranchPhone": "",
    }


def preview_campaign(
    db: Session,
    actor: "AuthenticatedActor",
    *,
    template_code: str | None,
    message_template: str | None,
    filters: SmsCampaignAudienceFilter,
) -> SmsCampaignPreviewResponse:
    settings = get_or_create_sms_settings(db, actor.tenant_id)
    template_content = message_template
    if template_code:
        template = get_sms_template(db, actor.tenant_id, template_code, filters.branch_id)
        if template is None:
            raise ValueError("SMS template not found.")
        template_content = template.content
    if not template_content:
        raise ValueError("message_template or template_code is required.")

    audience = build_campaign_audience(db, actor, filters, settings)
    rendered_samples: list[SmsCampaignPreviewRecipient] = []
    total_segments = 0
    for metrics in audience:
        rendered_message = render_sms_template(template_content, _build_marketing_variables(metrics))
        total_segments += estimate_sms_segments(rendered_message)
        if len(rendered_samples) < 3:
            rendered_samples.append(
                SmsCampaignPreviewRecipient(
                    customer_id=metrics.customer.id,
                    customer_name=metrics.customer.name,
                    phone_normalized=metrics.customer.phone_normalized,
                    rendered_message=rendered_message,
                )
            )

    estimated_cost = calculate_sms_cost(total_segments, settings.cost_per_segment)
    return SmsCampaignPreviewResponse(
        recipient_count=len(audience),
        total_segments=total_segments,
        estimated_cost=estimated_cost,
        samples=rendered_samples,
    )


def create_campaign(db: Session, actor: "AuthenticatedActor", payload: "SmsCampaignCreate") -> SmsCampaign:
    preview = preview_campaign(
        db,
        actor,
        template_code=payload.template_code,
        message_template=payload.message_template,
        filters=payload.filter,
    )
    template = get_sms_template(db, actor.tenant_id, payload.template_code, payload.branch_id) if payload.template_code else None
    campaign = SmsCampaign(
        tenant_id=actor.tenant_id,
        branch_id=actor.branch_id if actor.role.value == "branch_admin" else payload.branch_id,
        created_by=actor.id,
        template_id=template.id if template else None,
        name=payload.name,
        campaign_type=payload.campaign_type,
        status=SmsCampaignStatus.SCHEDULED if payload.scheduled_at else SmsCampaignStatus.DRAFT,
        message_template=template.content if template else str(payload.message_template or ""),
        filter_json=payload.filter.model_dump(mode="json"),
        recipient_count_estimate=preview.recipient_count,
        recipient_count_actual=0,
        estimated_cost=preview.estimated_cost,
        actual_cost=Decimal("0.00"),
        scheduled_at=payload.scheduled_at,
    )
    db.add(campaign)
    db.flush()
    return campaign


def launch_campaign(db: Session, actor: "AuthenticatedActor", campaign: SmsCampaign, scheduled_at: datetime | None = None) -> SmsCampaign:
    settings = get_or_create_sms_settings(db, actor.tenant_id)
    filters = SmsCampaignAudienceFilter.model_validate(campaign.filter_json or {})
    audience = build_campaign_audience(db, actor, filters, settings)
    if len(audience) > settings.campaign_recipient_limit:
        raise ValueError("Campaign recipient count exceeds the configured campaign limit.")

    effective_schedule = scheduled_at or campaign.scheduled_at
    total_cost = Decimal("0.00")
    for metrics in audience:
        message_body = render_sms_template(campaign.message_template, _build_marketing_variables(metrics))
        log = queue_sms_message(
            db,
            tenant_id=campaign.tenant_id,
            branch_id=metrics.customer.branch_id,
            customer=metrics.customer,
            phone=metrics.customer.phone,
            message_body=message_body,
            sms_type=campaign.campaign_type,
            trigger_event="campaign_send",
            dedupe_key=f"campaign:{campaign.id}:{metrics.customer.id}",
            template=None,
            order=None,
            payment=None,
            campaign=campaign,
            scheduled_at=effective_schedule,
            marketing=True,
        )
        total_cost += Decimal(log.estimated_cost)

    campaign.recipient_count_actual = len(audience)
    campaign.actual_cost = total_cost.quantize(Decimal("0.01"))
    if effective_schedule and effective_schedule > utc_now():
        campaign.status = SmsCampaignStatus.SCHEDULED
        campaign.scheduled_at = effective_schedule
    else:
        campaign.status = SmsCampaignStatus.RUNNING
        campaign.launched_at = utc_now()
        campaign.scheduled_at = effective_schedule or utc_now()

    db.flush()
    return campaign


def cancel_campaign(db: Session, campaign: SmsCampaign) -> SmsCampaign:
    campaign.status = SmsCampaignStatus.CANCELLED
    for log in campaign.logs:
        if log.status == SmsLogStatus.QUEUED:
            log.status = SmsLogStatus.CANCELLED
            log.error_message = "Campaign cancelled by admin."
    db.flush()
    return campaign


def record_manual_test_sms(db: Session, actor: "AuthenticatedActor", payload: "SmsManualSendRequest") -> SmsLog:
    settings = get_or_create_sms_settings(db, actor.tenant_id)
    normalized_phone, is_valid_phone = normalize_phone_number(payload.phone)
    if not is_valid_phone or not normalized_phone:
        raise ValueError("Phone number is invalid.")

    segment_count = estimate_sms_segments(payload.message)
    estimated_cost = calculate_sms_cost(segment_count, settings.cost_per_segment)
    branch_id = actor.branch_id or payload.branch_id or _get_default_sms_branch_id(db, actor.tenant_id)
    if branch_id is None:
        raise ValueError("Create a branch or select a branch before sending SMS test messages.")

    log = SmsLog(
        tenant_id=actor.tenant_id,
        branch_id=branch_id,
        customer_id=None,
        order_id=None,
        payment_id=None,
        campaign_id=None,
        template_id=None,
        sms_type="manual_test",
        trigger_event="manual_test",
        dedupe_key=f"manual_test:{actor.id}:{int(utc_now().timestamp())}",
        phone_raw=payload.phone,
        phone_normalized=normalized_phone,
        message_body=payload.message,
        status=SmsLogStatus.SENDING,
        provider_name=settings.provider_name,
        segment_count=segment_count,
        estimated_cost=estimated_cost,
        actual_cost=Decimal("0.00"),
        retry_count=0,
        scheduled_at=utc_now(),
    )
    db.add(log)
    db.flush()

    try:
        provider_message_id, _raw_response = send_via_gateway(settings, normalized_phone, payload.message)
        log.status = SmsLogStatus.SENT
        log.provider_message_id = provider_message_id
        log.sent_at = utc_now()
        log.actual_cost = estimated_cost
        log.error_message = None
    except Exception as exc:
        log.status = SmsLogStatus.FAILED
        log.error_message = str(exc)

    db.flush()
    return log


def record_manual_order_sms(
    db: Session,
    actor: "AuthenticatedActor",
    order: Order,
    payload: "SmsOrderManualSendRequest",
) -> SmsLog:
    customer = getattr(order, "customer", None)
    log = queue_sms_message(
        db,
        tenant_id=actor.tenant_id,
        branch_id=order.branch_id,
        customer=customer,
        phone=payload.phone,
        message_body=payload.message,
        sms_type="manual_due_message",
        trigger_event="manual_due_send",
        dedupe_key=f"manual_due_message:{order.id}:{uuid.uuid4().hex}",
        order=order,
    )
    if log.status == SmsLogStatus.QUEUED:
        dispatch_sms_logs_now(db, [log.id])
    db.flush()
    return log


def _finalize_campaign_if_complete(db: Session, log: SmsLog) -> None:
    if log.campaign_id is None:
        return
    campaign = db.scalar(select(SmsCampaign).where(SmsCampaign.id == log.campaign_id))
    if campaign is None:
        return
    remaining = int(
        db.scalar(
            select(func.count(SmsLog.id)).where(
                SmsLog.campaign_id == campaign.id,
                SmsLog.status.in_([SmsLogStatus.QUEUED, SmsLogStatus.SENDING]),
            )
        )
        or 0
    )
    if remaining == 0 and campaign.status in {SmsCampaignStatus.RUNNING, SmsCampaignStatus.SCHEDULED}:
        campaign.status = SmsCampaignStatus.COMPLETED
        campaign.completed_at = utc_now()


def _process_sms_log(db: Session, log: SmsLog, current_time: datetime | None = None) -> bool:
    if log.status != SmsLogStatus.QUEUED:
        return False

    effective_now = current_time or utc_now()
    if log.scheduled_at is not None and log.scheduled_at > effective_now:
        return False

    settings = get_or_create_sms_settings(db, log.tenant_id)
    if not log.phone_normalized:
        log.status = SmsLogStatus.FAILED
        log.error_message = "Normalized phone number is missing."
        _finalize_campaign_if_complete(db, log)
        return True

    try:
        log.status = SmsLogStatus.SENDING
        provider_message_id, _response = send_via_gateway(settings, log.phone_normalized, log.message_body)
        log.status = SmsLogStatus.SENT
        log.provider_message_id = provider_message_id
        log.sent_at = utc_now()
        log.actual_cost = log.estimated_cost
        log.error_message = None
    except Exception as exc:
        retry_limit = max(0, settings.max_retries)
        next_retry_count = log.retry_count + 1
        if next_retry_count <= retry_limit:
            backoff_index = min(next_retry_count - 1, len(SMS_RETRY_BACKOFF_MINUTES) - 1)
            log.retry_count = next_retry_count
            log.status = SmsLogStatus.QUEUED
            log.error_message = str(exc)
            log.scheduled_at = utc_now() + timedelta(minutes=SMS_RETRY_BACKOFF_MINUTES[backoff_index])
        else:
            log.retry_count = next_retry_count
            log.status = SmsLogStatus.FAILED
            log.error_message = str(exc)

    _finalize_campaign_if_complete(db, log)
    return True


def dispatch_sms_logs_now(db: Session, log_ids: list[Any]) -> int:
    if not log_ids:
        return 0

    current_time = utc_now()
    stmt = (
        select(SmsLog)
        .where(
            SmsLog.id.in_(log_ids),
            SmsLog.status == SmsLogStatus.QUEUED,
            or_(SmsLog.scheduled_at.is_(None), SmsLog.scheduled_at <= current_time),
        )
        .order_by(SmsLog.scheduled_at.asc(), SmsLog.created_at.asc())
    )
    logs = list(db.scalars(stmt))
    processed = 0
    for log in logs:
        if _process_sms_log(db, log, current_time):
            processed += 1
    db.flush()
    return processed


def process_sms_queue(db: Session, batch_size: int = 50) -> int:
    current_time = utc_now()
    stmt = (
        select(SmsLog)
        .where(
            SmsLog.status == SmsLogStatus.QUEUED,
            or_(SmsLog.scheduled_at.is_(None), SmsLog.scheduled_at <= current_time),
        )
        .order_by(SmsLog.scheduled_at.asc(), SmsLog.created_at.asc())
        .limit(batch_size)
    )
    logs = list(db.scalars(stmt))
    processed = 0

    for log in logs:
        if _process_sms_log(db, log, current_time):
            processed += 1

    db.flush()
    return processed


def queue_due_reminders(db: Session, tenant_id=None, branch_id=None, reference_date: date | None = None) -> int:
    target_date = reference_date or date.today()
    stmt = (
        select(Order)
        .options(selectinload(Order.customer), selectinload(Order.items), selectinload(Order.payments), selectinload(Order.branch_rel))
        .where(
            Order.due_date.is_not(None),
            Order.status != OrderStatus.DELIVERED,
        )
    )
    if tenant_id is not None:
        stmt = stmt.where(Order.tenant_id == tenant_id)
    if branch_id is not None:
        stmt = stmt.where(Order.branch_id == branch_id)

    orders = list(db.scalars(stmt))
    queued = 0
    for order in orders:
        if order.customer is None or order.due_date is None:
            continue
        settings = get_or_create_sms_settings(db, order.tenant_id)
        if order.due_date + timedelta(days=settings.due_reminder_delay_days) > target_date:
            continue
        log = queue_due_reminder_sms(
            db,
            order,
            order.customer,
            reference_date=target_date,
        )
        if log is not None:
            queued += 1
    db.flush()
    return queued


def update_sms_delivery_status(
    db: Session,
    *,
    provider_name: str,
    provider_message_id: str,
    status: str,
    error_message: str | None = None,
) -> SmsLog | None:
    log = db.scalar(
        select(SmsLog).where(
            SmsLog.provider_name == provider_name,
            SmsLog.provider_message_id == provider_message_id,
        )
    )
    if log is None:
        return None

    normalized_status = status.strip().lower()
    if normalized_status in {"delivered", "success"}:
        log.status = SmsLogStatus.DELIVERED
        log.delivered_at = utc_now()
        log.error_message = None
    elif normalized_status in {"failed", "undelivered"}:
        log.status = SmsLogStatus.FAILED
        log.error_message = error_message or "Gateway delivery failure."
    elif normalized_status in {"sent", "accepted"}:
        log.status = SmsLogStatus.SENT
        log.error_message = None

    db.flush()
    return log
