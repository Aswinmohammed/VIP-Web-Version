from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, Uuid, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class TenantScopedMixin:
    tenant_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)


class BranchScopedMixin(TenantScopedMixin):
    branch_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)


class LegacyIdMixin:
    legacy_id: Mapped[str | None] = mapped_column(String(120), nullable=True)


class UserRole(str, enum.Enum):
    MASTER_ADMIN = "master_admin"
    BRANCH_ADMIN = "branch_admin"


class OrderStatus(str, enum.Enum):
    PENDING = "Pending"
    HOLD = "Hold"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"
    PACKED = "Packed"
    DUE = "Due"
    DELIVERED = "Delivered"


class OrderStatusType(TypeDecorator):
    """Custom SQLAlchemy type that forces OrderStatus enum to use .value
    when binding to PostgreSQL, preventing psycopg3 from using .name ('HOLD')
    instead of .value ('Hold').
    """
    impl = Enum(*[e.value for e in OrderStatus], name="order_status")
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        if isinstance(value, OrderStatus):
            return value.value  # Returns plain str 'Hold', not enum object
        return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        try:
            return OrderStatus(value)
        except ValueError:
            return value


class CompletionStatus(str, enum.Enum):
    PENDING = "pending"
    PARTIAL = "partial"
    COMPLETED = "completed"


class PaymentMethod(str, enum.Enum):
    CASH = "Cash"
    CARD = "Card"
    BANK_TRANSFER = "Bank Transfer"
    CHEQUE = "Cheque"


class MaterialSaleStatus(str, enum.Enum):
    PAID = "Paid"
    DUE = "Due"


class EmployeeType(str, enum.Enum):
    CUT_BASE = "CutBase"
    HOUR_BASE = "HourBase"
    BRANCH_EMPLOYEE = "BranchEmployee"


class SupplierPaymentMethod(str, enum.Enum):
    CHEQUE = "Cheque"
    BANK_TRANSFER = "Bank Transfer"
    MONEY = "Money"


class SmsTemplateCategory(str, enum.Enum):
    TRANSACTIONAL = "transactional"
    MARKETING = "marketing"
    FESTIVAL = "festival"


class SmsLogStatus(str, enum.Enum):
    QUEUED = "queued"
    SENDING = "sending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class SmsCampaignStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Tenant(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tenants"

    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    branches: Mapped[list["Branch"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(back_populates="tenant", cascade="all, delete-orphan")


class Branch(UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, Base):
    __tablename__ = "branches"
    __table_args__ = (UniqueConstraint("tenant_id", "code", name="uq_branches_tenant_code"),)

    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_production_hub: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_areas: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    order_actions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="branches")
    users: Mapped[list["User"]] = relationship(back_populates="branch")
    orders: Mapped[list["Order"]] = relationship(back_populates="branch_rel")


class User(UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("tenant_id", "username", name="uq_users_tenant_username"),)

    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True)
    username: Mapped[str] = mapped_column(String(150), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    tenant: Mapped["Tenant"] = relationship(back_populates="users")
    branch: Mapped["Branch | None"] = relationship(back_populates="users")


class Customer(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_customers_tenant_legacy"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_normalized: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    phone_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sms_opt_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    marketing_opt_in: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    orders: Mapped[list["Order"]] = relationship(back_populates="customer", passive_deletes=True)
    measurement_sets: Mapped[list["MeasurementSet"]] = relationship(back_populates="customer", passive_deletes=True)
    sms_logs: Mapped[list["SmsLog"]] = relationship(back_populates="customer", passive_deletes=True)


class Order(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "orders"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_orders_tenant_legacy"),)

    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), nullable=False, index=True)
    order_number: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    order_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[OrderStatus] = mapped_column(OrderStatusType(), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    advance: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    emergency: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_called: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    called_timestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    call_history: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    bag_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    customer: Mapped["Customer"] = relationship(back_populates="orders")
    branch_rel: Mapped["Branch"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    measurement_sets: Mapped[list["MeasurementSet"]] = relationship(back_populates="order")


class OrderItem(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "order_items"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_order_items_tenant_legacy"),)

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    dress_type: Mapped[str] = mapped_column(String(120), nullable=False)
    inventory_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True, index=True)
    cloth_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    cloth_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    cloth_size: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    stitch_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    price_per_unit: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_cut: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quality: Mapped[str | None] = mapped_column(String(120), nullable=True)
    completed_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completion_data: Mapped[list[bool] | None] = mapped_column(JSON, nullable=True)
    completion_status: Mapped[CompletionStatus] = mapped_column(
        Enum(CompletionStatus, name="completion_status"),
        default=CompletionStatus.PENDING,
        nullable=False,
    )

    order: Mapped["Order"] = relationship(back_populates="items")
    measurement_sets: Mapped[list["MeasurementSet"]] = relationship(back_populates="order_item")


class MeasurementSet(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "measurement_sets"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_measurement_sets_tenant_legacy"),)

    customer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("customers.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    order_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True, index=True)
    dress_type: Mapped[str] = mapped_column(String(120), nullable=False)
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    customer: Mapped["Customer"] = relationship(back_populates="measurement_sets")
    order: Mapped["Order | None"] = relationship(back_populates="measurement_sets")
    order_item: Mapped["OrderItem | None"] = relationship(back_populates="measurement_sets")
    values: Mapped[list["MeasurementValue"]] = relationship(back_populates="measurement_set", cascade="all, delete-orphan")


class MeasurementValue(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "measurement_values"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_measurement_values_tenant_legacy"),)

    measurement_set_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("measurement_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    measurement_set: Mapped["MeasurementSet"] = relationship(back_populates="values")


class Payment(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_payments_tenant_legacy"),)

    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    collector_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[PaymentMethod | None] = mapped_column(Enum(PaymentMethod, name="payment_method"), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship(back_populates="payments")


class InventoryItem(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "inventory_items"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_inventory_items_tenant_legacy"),)

    item_code: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    barcode_value: Mapped[str | None] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mrp: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    wholesale_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    last_updated: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Expense(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "expenses"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_expenses_tenant_legacy"),)

    description: Mapped[str] = mapped_column(Text, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)


class MaterialSale(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "material_sales"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_material_sales_tenant_legacy"),)

    sale_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    discount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    payment_method: Mapped[PaymentMethod | None] = mapped_column(Enum(PaymentMethod, name="material_sale_payment_method"), nullable=True)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[MaterialSaleStatus | None] = mapped_column(Enum(MaterialSaleStatus, name="material_sale_status"), nullable=True)

    items: Mapped[list["MaterialSaleItem"]] = relationship(back_populates="material_sale", cascade="all, delete-orphan")


class MaterialSaleItem(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "material_sale_items"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_material_sale_items_tenant_legacy"),)

    material_sale_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("material_sales.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True)
    source_inventory_legacy_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    category: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    material_sale: Mapped["MaterialSale"] = relationship(back_populates="items")


class Employee(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "employees"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_employees_tenant_legacy"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    type: Mapped[EmployeeType] = mapped_column(Enum(EmployeeType, name="employee_type"), nullable=False)
    salary_source_branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True)
    piece_rates: Mapped[dict[str, float] | None] = mapped_column(JSON, nullable=True)
    branch_piece_rate_history: Mapped[list[dict[str, object]] | None] = mapped_column(JSON, nullable=True)
    joined_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    work_logs: Mapped[list["EmployeeWorkLog"]] = relationship(back_populates="employee", cascade="all, delete-orphan")
    salary_payments: Mapped[list["EmployeeSalaryPayment"]] = relationship(back_populates="employee", cascade="all, delete-orphan")


class EmployeeWorkLog(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "employee_work_logs"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_employee_work_logs_tenant_legacy"),)

    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    dress_type: Mapped[str] = mapped_column(String(120), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    start_hour: Mapped[str | None] = mapped_column(String(32), nullable=True)
    end_hour: Mapped[str | None] = mapped_column(String(32), nullable=True)
    salary_per_hour: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    auto_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    source_branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True)
    source_order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    source_order_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("order_items.id", ondelete="SET NULL"), nullable=True, index=True)

    employee: Mapped["Employee"] = relationship(back_populates="work_logs")


class EmployeeSalaryPayment(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "employee_salary_payments"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_employee_salary_payments_tenant_legacy"),)

    employee_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    employee: Mapped["Employee"] = relationship(back_populates="salary_payments")


class Supplier(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "suppliers"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_suppliers_tenant_legacy"),)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    joined_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    purchases: Mapped[list["SupplierPurchase"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")
    payments: Mapped[list["SupplierPayment"]] = relationship(back_populates="supplier", cascade="all, delete-orphan")


class SupplierPurchase(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "supplier_purchases"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_supplier_purchases_tenant_legacy"),)

    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    supplier: Mapped["Supplier"] = relationship(back_populates="purchases")


class SupplierPayment(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, LegacyIdMixin, Base):
    __tablename__ = "supplier_payments"
    __table_args__ = (UniqueConstraint("tenant_id", "legacy_id", name="uq_supplier_payments_tenant_legacy"),)

    supplier_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("suppliers.id", ondelete="CASCADE"), nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    method: Mapped[SupplierPaymentMethod] = mapped_column(Enum(SupplierPaymentMethod, name="supplier_payment_method"), nullable=False)
    recorded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    supplier: Mapped["Supplier"] = relationship(back_populates="payments")


class SmsSettings(UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, Base):
    __tablename__ = "sms_settings"
    __table_args__ = (UniqueConstraint("tenant_id", name="uq_sms_settings_tenant"),)

    provider_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    sender_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    api_base_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    api_key_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    transactional_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    marketing_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    daily_sms_limit: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    campaign_recipient_limit: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    cost_per_segment: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    due_reminder_delay_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    inactive_customer_days: Mapped[int] = mapped_column(Integer, default=365, nullable=False)
    quiet_hours_start: Mapped[str | None] = mapped_column(String(5), nullable=True)
    quiet_hours_end: Mapped[str | None] = mapped_column(String(5), nullable=True)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)


class SmsTemplate(UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, Base):
    __tablename__ = "sms_templates"
    __table_args__ = (UniqueConstraint("tenant_id", "branch_id", "code", name="uq_sms_templates_scope_code"),)

    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="CASCADE"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[SmsTemplateCategory] = mapped_column(Enum(SmsTemplateCategory, name="sms_template_category"), nullable=False)
    trigger_event: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    variables_json: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    branch_rel: Mapped["Branch | None"] = relationship()


class SmsCampaign(UUIDPrimaryKeyMixin, TimestampMixin, TenantScopedMixin, Base):
    __tablename__ = "sms_campaigns"

    branch_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("branches.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sms_templates.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    campaign_type: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[SmsCampaignStatus] = mapped_column(Enum(SmsCampaignStatus, name="sms_campaign_status"), nullable=False, default=SmsCampaignStatus.DRAFT)
    message_template: Mapped[str] = mapped_column(Text, nullable=False)
    filter_json: Mapped[dict[str, object]] = mapped_column(JSON, default=dict, nullable=False)
    recipient_count_estimate: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    recipient_count_actual: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    estimated_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    actual_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    template: Mapped["SmsTemplate | None"] = relationship()
    logs: Mapped[list["SmsLog"]] = relationship(back_populates="campaign")


class SmsLog(UUIDPrimaryKeyMixin, TimestampMixin, BranchScopedMixin, Base):
    __tablename__ = "sms_logs"
    __table_args__ = (UniqueConstraint("tenant_id", "dedupe_key", name="uq_sms_logs_tenant_dedupe"),)

    customer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("payments.id", ondelete="SET NULL"), nullable=True, index=True)
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sms_campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    template_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("sms_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    sms_type: Mapped[str] = mapped_column(String(120), nullable=False)
    trigger_event: Mapped[str | None] = mapped_column(String(120), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_raw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_normalized: Mapped[str | None] = mapped_column(String(32), nullable=True)
    message_body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SmsLogStatus] = mapped_column(Enum(SmsLogStatus, name="sms_log_status"), nullable=False, default=SmsLogStatus.QUEUED)
    provider_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    segment_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    estimated_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    actual_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    customer: Mapped["Customer | None"] = relationship(back_populates="sms_logs")
    campaign: Mapped["SmsCampaign | None"] = relationship(back_populates="logs")
    template: Mapped["SmsTemplate | None"] = relationship()
