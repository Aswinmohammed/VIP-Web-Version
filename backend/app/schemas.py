from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.app.models import (
    CompletionStatus,
    EmployeeType,
    MaterialSaleStatus,
    OrderStatus,
    PaymentMethod,
    SmsCampaignStatus,
    SmsLogStatus,
    SmsTemplateCategory,
    SupplierPaymentMethod,
    UserRole,
)


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


_LOCAL_DATETIME_PATTERN = re.compile(
    r"^(?P<day>\d{2})/(?P<month>\d{2})/(?P<year>\d{4})(?:,\s*(?P<hour>\d{2}):(?P<minute>\d{2})(?::(?P<second>\d{2}))?)?$"
)


def _parse_flexible_datetime(value: object) -> object:
    if value is None or isinstance(value, datetime):
        return value

    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())

    if not isinstance(value, str):
        return value

    text = value.strip()
    if not text:
        return None

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        match = _LOCAL_DATETIME_PATTERN.fullmatch(text)
        if not match:
            return value

        groups = match.groupdict()
        return datetime(
            int(groups["year"]),
            int(groups["month"]),
            int(groups["day"]),
            int(groups["hour"] or 0),
            int(groups["minute"] or 0),
            int(groups["second"] or 0),
        )


class LoginRequest(BaseModel):
    tenant_code: str = Field(min_length=1, max_length=64)
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=1, max_length=255)


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenUser(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    username: str
    role: UserRole
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: TokenUser


class BranchBase(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    address: str | None = None
    phone: str | None = None
    is_active: bool = True
    is_production_hub: bool = False
    access_areas: list[str] = Field(default_factory=list)
    order_actions: list[str] = Field(default_factory=list)


class BranchCreate(BranchBase):
    pass


class BranchRead(BranchBase, ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str = Field(min_length=8, max_length=255)
    role: UserRole
    branch_id: uuid.UUID | None = None
    is_active: bool = True


class UserUpdate(BaseModel):
    username: str = Field(min_length=1, max_length=150)
    password: str | None = Field(default=None, min_length=8, max_length=255)
    role: UserRole
    branch_id: uuid.UUID | None = None
    is_active: bool = True


class UserRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerBase(BaseModel):
    branch_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    address: str | None = None
    email: str | None = None
    sms_opt_in: bool = True
    marketing_opt_in: bool = True


class CustomerCreate(CustomerBase):
    pass


class CustomerRead(CustomerBase, ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    legacy_id: str | None
    branch_id: uuid.UUID
    phone_normalized: str | None = None
    phone_valid: bool = False
    created_at: datetime
    updated_at: datetime


class MeasurementValueInput(BaseModel):
    id: str | None = None
    name: str
    value: str | None = None
    sort_order: int = 0


class MeasurementValueRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    name: str
    value: str | None
    sort_order: int


class MeasurementSetRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    customer_id: uuid.UUID
    order_id: uuid.UUID | None
    order_item_id: uuid.UUID | None
    dress_type: str
    version_no: int
    note: str | None
    captured_at: datetime
    values: list[MeasurementValueRead]


class OrderItemInput(BaseModel):
    id: str | None = None
    dress_type: str
    inventory_item_id: uuid.UUID | None = None
    cloth_code: str | None = None
    cloth_name: str | None = None
    cloth_size: Decimal | None = None
    stitch_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    quantity: int = Field(ge=1)
    price_per_unit: Decimal = Field(ge=0)
    measurements: list[MeasurementValueInput] = Field(default_factory=list)
    note: str | None = None
    is_cut: bool = False
    quality: str | None = None
    completed_quantity: int = 0
    completion_data: list[bool] = Field(default_factory=list)
    completion_status: CompletionStatus = CompletionStatus.PENDING


class OrderItemRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    dress_type: str
    inventory_item_id: uuid.UUID | None
    cloth_code: str | None
    cloth_name: str | None
    cloth_size: Decimal | None
    stitch_fee: Decimal
    quantity: int
    price_per_unit: Decimal
    note: str | None
    is_cut: bool
    quality: str | None
    completed_quantity: int
    completion_data: list[bool] | None
    completion_status: CompletionStatus
    measurements: list[MeasurementValueRead] = Field(default_factory=list)


class PaymentInput(BaseModel):
    amount: Decimal = Field(ge=0)
    payment_date: date
    method: PaymentMethod | None = None
    note: str | None = None


class PaymentRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    amount: Decimal
    payment_date: date
    method: PaymentMethod | None
    note: str | None
    collector_user_id: uuid.UUID | None
    branch_id: uuid.UUID


class InventoryItemBase(BaseModel):
    branch_id: uuid.UUID | None = None
    item_code: str | None = Field(default=None, max_length=120)
    barcode_value: str | None = Field(default=None, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    category: str = Field(default="Material", min_length=1, max_length=120)
    quantity: Decimal = Field(ge=0)
    unit_price: Decimal = Field(ge=0)
    mrp: Decimal = Field(default=Decimal("0.00"), ge=0)
    wholesale_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    last_updated: datetime | None = None
    is_active: bool = True


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    legacy_id: str | None
    branch_id: uuid.UUID
    item_code: str | None
    barcode_value: str | None
    name: str
    category: str
    quantity: Decimal
    unit_price: Decimal
    mrp: Decimal
    wholesale_price: Decimal
    last_updated: datetime | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ExpenseBase(BaseModel):
    branch_id: uuid.UUID | None = None
    description: str = Field(min_length=1)
    amount: Decimal = Field(ge=0)
    expense_date: date


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    legacy_id: str | None
    branch_id: uuid.UUID
    description: str
    amount: Decimal
    expense_date: date
    created_at: datetime
    updated_at: datetime


class OrderCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    customer_id: uuid.UUID
    order_number: str | None = None
    order_date: date
    due_date: date | None = None
    status: OrderStatus = OrderStatus.PENDING
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    advance: Decimal = Field(default=Decimal("0.00"), ge=0)
    emergency: bool = False
    is_called: bool = False
    called_timestamp: datetime | None = None
    call_history: list[str] = Field(default_factory=list)
    bag_count: int | None = None
    items: list[OrderItemInput]
    payments: list[PaymentInput] = Field(default_factory=list)


class OrderRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID
    branch_name: str | None = None
    branch_code: str | None = None
    branch_address: str | None = None
    branch_phone: str | None = None
    legacy_id: str | None
    customer_id: uuid.UUID
    customer_name: str | None = None
    customer_phone: str | None = None
    order_number: str
    order_date: date
    due_date: date | None
    status: OrderStatus
    discount: Decimal
    advance: Decimal
    emergency: bool
    is_called: bool
    called_timestamp: datetime | None
    call_history: list[str] | None
    bag_count: int | None
    created_at: datetime
    updated_at: datetime
    items: list[OrderItemRead]
    payments: list[PaymentRead]


class AppBootstrapResponse(BaseModel):
    branches: list[BranchRead]
    customers: list[CustomerRead]
    orders: list[OrderRead]


class OrderStatusUpdate(BaseModel):
    status: OrderStatus


class SalesSummary(BaseModel):
    order_count: int
    gross_amount: Decimal
    discount_amount: Decimal
    net_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal


class BranchSalesSummary(BaseModel):
    branch_id: uuid.UUID
    branch_code: str
    branch_name: str
    order_count: int
    net_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal


class GlobalSalesResponse(BaseModel):
    tenant_id: uuid.UUID
    from_date: date | None = None
    to_date: date | None = None
    totals: SalesSummary
    by_branch: list[BranchSalesSummary]


class ProductionNotificationRead(BaseModel):
    branch_id: uuid.UUID
    branch_name: str
    latest_order_number: str
    count: int


class MaterialSaleItemInput(BaseModel):
    id: str | None = None
    inventory_item_id: uuid.UUID | None = None
    source_inventory_legacy_id: str | None = None
    category: str = Field(min_length=1, max_length=120)
    quantity: Decimal = Field(ge=0)
    unit_price: Decimal = Field(ge=0)
    cost_price: Decimal = Field(default=Decimal("0.00"), ge=0)
    amount: Decimal = Field(ge=0)


class MaterialSaleCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    sale_date: date
    total_amount: Decimal = Field(ge=0)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    paid_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_method: PaymentMethod | None = None
    customer_name: str | None = None
    status: MaterialSaleStatus | None = None
    items: list[MaterialSaleItemInput]


class MaterialSaleItemRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    category: str
    quantity: Decimal
    unit_price: Decimal
    cost_price: Decimal
    amount: Decimal
    inventory_item_id: uuid.UUID | None
    source_inventory_legacy_id: str | None


class MaterialSaleRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    branch_id: uuid.UUID
    sale_date: date
    total_amount: Decimal
    discount: Decimal
    paid_amount: Decimal
    payment_method: PaymentMethod | None
    customer_name: str | None
    status: MaterialSaleStatus | None
    items: list[MaterialSaleItemRead]


class EmployeeWorkLogInput(BaseModel):
    id: str | None = None
    dress_type: str = Field(min_length=1, max_length=120)
    quantity: int = Field(ge=0)
    unit_price: Decimal = Field(ge=0)
    total_amount: Decimal = Field(ge=0)
    work_date: date
    recorded_at: datetime | None = None
    start_hour: str | None = None
    end_hour: str | None = None
    salary_per_hour: Decimal | None = Field(default=None, ge=0)
    auto_generated: bool = False
    source_branch_id: uuid.UUID | None = None
    source_order_id: uuid.UUID | None = None
    source_order_item_id: uuid.UUID | None = None

    @field_validator("recorded_at", mode="before")
    @classmethod
    def _normalize_recorded_at(cls, value: object) -> object:
        return _parse_flexible_datetime(value)


class EmployeeSalaryPaymentInput(BaseModel):
    id: str | None = None
    amount: Decimal = Field(ge=0)
    payment_date: date
    recorded_at: datetime | None = None
    note: str | None = None

    @field_validator("recorded_at", mode="before")
    @classmethod
    def _normalize_recorded_at(cls, value: object) -> object:
        return _parse_flexible_datetime(value)


class BranchPieceRateInput(BaseModel):
    id: str | None = None
    rate: Decimal = Field(ge=0)
    effective_from: date
    note: str | None = None
    created_at: datetime | None = None

    @field_validator("created_at", mode="before")
    @classmethod
    def _normalize_created_at(cls, value: object) -> object:
        return _parse_flexible_datetime(value)


class EmployeeCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    type: EmployeeType
    salary_source_branch_id: uuid.UUID | None = None
    piece_rates: dict[str, Decimal] | None = None
    branch_piece_rate_history: list[BranchPieceRateInput] = Field(default_factory=list)
    joined_date: date | None = None
    work_logs: list[EmployeeWorkLogInput] = Field(default_factory=list)
    salary_payments: list[EmployeeSalaryPaymentInput] = Field(default_factory=list)


class EmployeeWorkLogRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    dress_type: str
    quantity: int
    unit_price: Decimal
    total_amount: Decimal
    work_date: date
    recorded_at: datetime | None
    start_hour: str | None
    end_hour: str | None
    salary_per_hour: Decimal | None
    auto_generated: bool
    source_branch_id: uuid.UUID | None
    source_order_id: uuid.UUID | None
    source_order_item_id: uuid.UUID | None


class EmployeeSalaryPaymentRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    amount: Decimal
    payment_date: date
    recorded_at: datetime | None
    note: str | None


class BranchPieceRateRead(ORMModel):
    id: str | None = None
    rate: Decimal
    effective_from: date
    note: str | None = None
    created_at: datetime | None = None


class EmployeeRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    branch_id: uuid.UUID
    name: str
    phone: str | None
    type: EmployeeType
    salary_source_branch_id: uuid.UUID | None
    piece_rates: dict[str, Decimal] | None = None
    branch_piece_rate_history: list[BranchPieceRateRead] = Field(default_factory=list)
    joined_date: date | None
    work_logs: list[EmployeeWorkLogRead]
    salary_payments: list[EmployeeSalaryPaymentRead]

    @field_validator("branch_piece_rate_history", mode="before")
    @classmethod
    def _normalize_branch_piece_rate_history(cls, value: object) -> list[object]:
        return [] if value is None else value


class SupplierPurchaseInput(BaseModel):
    id: str | None = None
    description: str = Field(min_length=1)
    quantity: Decimal | None = Field(default=None, ge=0)
    unit_price: Decimal | None = Field(default=None, ge=0)
    amount: Decimal = Field(ge=0)
    purchase_date: date
    recorded_at: datetime | None = None


class SupplierPaymentInput(BaseModel):
    id: str | None = None
    amount: Decimal = Field(ge=0)
    payment_date: date
    method: SupplierPaymentMethod
    recorded_at: datetime | None = None
    note: str | None = None


class SupplierCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    phone: str | None = None
    joined_date: date | None = None
    purchases: list[SupplierPurchaseInput] = Field(default_factory=list)
    payments: list[SupplierPaymentInput] = Field(default_factory=list)


class SupplierPurchaseRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    description: str
    quantity: Decimal | None
    unit_price: Decimal | None
    amount: Decimal
    purchase_date: date
    recorded_at: datetime | None


class SupplierPaymentRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    amount: Decimal
    payment_date: date
    method: SupplierPaymentMethod
    recorded_at: datetime | None
    note: str | None


class SupplierRead(ORMModel):
    id: uuid.UUID
    legacy_id: str | None
    branch_id: uuid.UUID
    name: str
    phone: str | None
    joined_date: date | None
    purchases: list[SupplierPurchaseRead]
    payments: list[SupplierPaymentRead]


class SmsSettingsUpdate(BaseModel):
    provider_name: str | None = None
    sender_id: str | None = None
    api_base_url: str | None = None
    api_key_ref: str | None = None
    is_enabled: bool = False
    transactional_enabled: bool = True
    marketing_enabled: bool = False
    daily_sms_limit: int = Field(default=2, ge=1, le=10)
    campaign_recipient_limit: int = Field(default=500, ge=1, le=50000)
    cost_per_segment: Decimal = Field(default=Decimal("0.00"), ge=0)
    due_reminder_delay_days: int = Field(default=1, ge=0, le=30)
    inactive_customer_days: int = Field(default=365, ge=1, le=3650)
    quiet_hours_start: str | None = Field(default="09:00", pattern=r"^\d{2}:\d{2}$")
    quiet_hours_end: str | None = Field(default="19:00", pattern=r"^\d{2}:\d{2}$")
    max_retries: int = Field(default=3, ge=0, le=10)


class SmsSettingsRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    provider_name: str | None
    sender_id: str | None
    api_base_url: str | None
    api_key_ref: str | None
    is_enabled: bool
    transactional_enabled: bool
    marketing_enabled: bool
    daily_sms_limit: int
    campaign_recipient_limit: int
    cost_per_segment: Decimal
    due_reminder_delay_days: int
    inactive_customer_days: int
    quiet_hours_start: str | None
    quiet_hours_end: str | None
    max_retries: int
    created_at: datetime
    updated_at: datetime


class SmsTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    category: SmsTemplateCategory | None = None
    trigger_event: str | None = None
    is_enabled: bool | None = None
    content: str | None = None
    variables_json: list[str] | None = None


class SmsTemplateRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    code: str
    name: str
    category: SmsTemplateCategory
    trigger_event: str | None
    is_enabled: bool
    content: str
    variables_json: list[str]
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime


class SmsLogRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID
    customer_id: uuid.UUID | None
    order_id: uuid.UUID | None
    payment_id: uuid.UUID | None
    campaign_id: uuid.UUID | None
    template_id: uuid.UUID | None
    sms_type: str
    trigger_event: str | None
    dedupe_key: str
    phone_raw: str | None
    phone_normalized: str | None
    message_body: str
    status: SmsLogStatus
    provider_name: str | None
    provider_message_id: str | None
    segment_count: int
    estimated_cost: Decimal
    actual_cost: Decimal
    retry_count: int
    error_message: str | None
    scheduled_at: datetime | None
    sent_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SmsAnalyticsRead(BaseModel):
    queued_count: int
    sent_today: int
    failed_today: int
    delivered_today: int
    sent_this_month: int
    estimated_cost_today: Decimal
    estimated_cost_this_month: Decimal


class SmsManualSendRequest(BaseModel):
    branch_id: uuid.UUID | None = None
    phone: str = Field(min_length=5, max_length=64)
    message: str = Field(min_length=1, max_length=1000)


class SmsOrderManualSendRequest(BaseModel):
    order_id: uuid.UUID
    phone: str = Field(min_length=5, max_length=64)
    message: str = Field(min_length=1, max_length=1000)


class SmsManualSendResponse(BaseModel):
    status: SmsLogStatus
    phone_normalized: str | None
    provider_message_id: str | None = None
    segment_count: int
    estimated_cost: Decimal
    message: str


class SmsCampaignAudienceFilter(BaseModel):
    branch_id: uuid.UUID | None = None
    last_visit_from: date | None = None
    last_visit_to: date | None = None
    total_orders_min: int | None = Field(default=None, ge=0)
    outstanding_balance_min: Decimal | None = Field(default=None, ge=0)
    include_inactive: bool = False


class SmsCampaignPreviewRequest(BaseModel):
    template_code: str | None = None
    message_template: str | None = None
    filter: SmsCampaignAudienceFilter = Field(default_factory=SmsCampaignAudienceFilter)


class SmsCampaignPreviewRecipient(BaseModel):
    customer_id: uuid.UUID
    customer_name: str
    phone_normalized: str | None
    rendered_message: str


class SmsCampaignPreviewResponse(BaseModel):
    recipient_count: int
    total_segments: int
    estimated_cost: Decimal
    samples: list[SmsCampaignPreviewRecipient]


class SmsCampaignCreate(BaseModel):
    branch_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=255)
    campaign_type: str = Field(min_length=1, max_length=50)
    template_code: str | None = None
    message_template: str | None = None
    filter: SmsCampaignAudienceFilter = Field(default_factory=SmsCampaignAudienceFilter)
    scheduled_at: datetime | None = None

    @field_validator("scheduled_at", mode="before")
    @classmethod
    def _normalize_scheduled_at(cls, value: object) -> object:
        return _parse_flexible_datetime(value)


class SmsCampaignRead(ORMModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    branch_id: uuid.UUID | None
    created_by: uuid.UUID | None
    template_id: uuid.UUID | None
    name: str
    campaign_type: str
    status: SmsCampaignStatus
    message_template: str
    filter_json: dict[str, object]
    recipient_count_estimate: int
    recipient_count_actual: int
    estimated_cost: Decimal
    actual_cost: Decimal
    scheduled_at: datetime | None
    launched_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SmsCampaignLaunchRequest(BaseModel):
    scheduled_at: datetime | None = None

    @field_validator("scheduled_at", mode="before")
    @classmethod
    def _normalize_scheduled_at(cls, value: object) -> object:
        return _parse_flexible_datetime(value)


class SmsDeliveryWebhookPayload(BaseModel):
    provider_message_id: str
    status: str
    error_message: str | None = None
