from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import get_settings
from backend.app.models import (
    Base,
    Branch,
    CompletionStatus,
    Customer,
    Employee,
    EmployeeSalaryPayment,
    EmployeeType,
    EmployeeWorkLog,
    Expense,
    InventoryItem,
    MaterialSale,
    MaterialSaleItem,
    MaterialSaleStatus,
    MeasurementSet,
    MeasurementValue,
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentMethod,
    Supplier,
    SupplierPayment,
    SupplierPaymentMethod,
    SupplierPurchase,
    Tenant,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import legacy tailor_db.json data into the SaaS PostgreSQL schema.")
    parser.add_argument("--json-file", required=True, type=Path)
    parser.add_argument("--tenant-code", required=True)
    parser.add_argument("--tenant-name", required=True)
    parser.add_argument("--default-branch-code", required=True)
    parser.add_argument("--default-branch-name", required=True)
    parser.add_argument("--database-url", default=None, help="Optional override for VIP_DATABASE_URL")
    parser.add_argument("--create-schema", action="store_true", help="Create tables from SQLAlchemy models before import")
    return parser.parse_args()


def to_decimal(value: Any, default: str = "0.00") -> Decimal:
    if value in (None, "", False):
        return Decimal(default)
    return Decimal(str(value))


def parse_date(value: Any) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%Y, %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).date()
    except ValueError as exc:
        raise ValueError(f"Could not parse date value: {value}") from exc


def parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time())
    text = str(value).strip()
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y, %H:%M:%S",
        "%m/%d/%Y, %I:%M:%S %p",
        "%m/%d/%Y, %I:%M %p",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"Could not parse datetime value: {value}") from exc


def normalize_branch_code(raw_value: Any, default_branch_code: str) -> str:
    text = str(raw_value).strip().upper() if raw_value not in (None, "") else ""
    return text or default_branch_code


def normalize_branch_name(code: str) -> str:
    return code.replace("_", " ").replace("-", " ").title()


def get_branch_code(value: Any, default_branch_code: str) -> str:
    return normalize_branch_code(value, default_branch_code)


def get_record_branch_code(record: dict[str, Any], default_branch_code: str) -> str:
    for field_name in ("branchId", "branchCode", "branch_id", "branch_code"):
        if field_name in record:
            return get_branch_code(record.get(field_name), default_branch_code)
    return default_branch_code


def normalize_order_status(value: Any) -> OrderStatus:
    if value is None:
        return OrderStatus.PENDING
    text = str(value).strip()
    mapping = {item.value: item for item in OrderStatus}
    if text not in mapping:
        raise ValueError(f"Unsupported order status: {value}")
    return mapping[text]


def normalize_completion_status(value: Any) -> CompletionStatus:
    if value is None:
        return CompletionStatus.PENDING
    text = str(value).strip().lower()
    mapping = {item.value: item for item in CompletionStatus}
    if text not in mapping:
        raise ValueError(f"Unsupported completion status: {value}")
    return mapping[text]


def normalize_payment_method(value: Any) -> PaymentMethod | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    mapping = {item.value: item for item in PaymentMethod}
    if text not in mapping:
        raise ValueError(f"Unsupported payment method: {value}")
    return mapping[text]


def normalize_material_sale_status(value: Any) -> MaterialSaleStatus | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    mapping = {item.value: item for item in MaterialSaleStatus}
    if text not in mapping:
        raise ValueError(f"Unsupported material sale status: {value}")
    return mapping[text]


def normalize_employee_type(value: Any) -> EmployeeType:
    if value in (None, ""):
        return EmployeeType.CUT_BASE
    text = str(value).strip()
    mapping = {item.value: item for item in EmployeeType}
    if text not in mapping:
        raise ValueError(f"Unsupported employee type: {value}")
    return mapping[text]


def normalize_supplier_payment_method(value: Any) -> SupplierPaymentMethod:
    text = str(value or "Money").strip()
    mapping = {item.value: item for item in SupplierPaymentMethod}
    if text not in mapping:
        raise ValueError(f"Unsupported supplier payment method: {value}")
    return mapping[text]


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_or_create_tenant(session: Session, tenant_code: str, tenant_name: str, stats: dict[str, dict[str, int]]) -> Tenant:
    tenant = session.scalar(select(Tenant).where(Tenant.code == tenant_code))
    if tenant:
        tenant.name = tenant_name
        tenant.is_active = True
        stats["tenants"]["updated"] += 1
        return tenant

    tenant = Tenant(code=tenant_code, name=tenant_name, is_active=True)
    session.add(tenant)
    session.flush()
    stats["tenants"]["created"] += 1
    return tenant


def get_or_create_branch(session: Session, tenant: Tenant, code: str, name: str, stats: dict[str, dict[str, int]]) -> Branch:
    branch = session.scalar(select(Branch).where(Branch.tenant_id == tenant.id, Branch.code == code))
    if branch:
        branch.name = name
        branch.is_active = True
        stats["branches"]["updated"] += 1
        return branch

    branch = Branch(tenant_id=tenant.id, code=code, name=name, is_active=True)
    session.add(branch)
    session.flush()
    stats["branches"]["created"] += 1
    return branch


def upsert_legacy_entity(
    session: Session,
    model,
    tenant_id,
    legacy_id: str,
    create_data: dict[str, Any],
    stats: dict[str, dict[str, int]],
    stat_key: str,
):
    instance = session.scalar(select(model).where(model.tenant_id == tenant_id, model.legacy_id == legacy_id))
    if instance:
        for key, value in create_data.items():
            setattr(instance, key, value)
        stats[stat_key]["updated"] += 1
        return instance, False

    instance = model(legacy_id=legacy_id, **create_data)
    session.add(instance)
    session.flush()
    stats[stat_key]["created"] += 1
    return instance, True


def next_measurement_version(session: Session, customer_id, dress_type: str) -> int:
    max_version = session.scalar(
        select(func.max(MeasurementSet.version_no)).where(
            MeasurementSet.customer_id == customer_id,
            MeasurementSet.dress_type == dress_type,
        )
    )
    return int(max_version or 0) + 1


def collect_branch_codes(data: dict[str, Any], default_branch_code: str) -> set[str]:
    branch_codes = {default_branch_code}
    for collection_name in ("customers", "orders", "inventory", "expenses", "materialSales", "employees", "suppliers"):
        for record in data.get(collection_name, []) or []:
            branch_codes.add(get_record_branch_code(record, default_branch_code))
    return branch_codes


def import_customers(session: Session, tenant: Tenant, data: dict[str, Any], branches: dict[str, Branch], default_branch_code: str, stats) -> dict[str, Customer]:
    customer_map: dict[str, Customer] = {}
    for record in data.get("customers", []):
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        customer, _ = upsert_legacy_entity(
            session,
            Customer,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "name": str(record.get("name", "")).strip(),
                "phone": str(record.get("phone", "")).strip() or None,
                "address": str(record.get("address", "")).strip() or None,
                "email": str(record.get("email", "")).strip() or None,
            },
            stats,
            "customers",
        )
        customer_map[legacy_id] = customer
    return customer_map


def import_inventory(session: Session, tenant: Tenant, data: dict[str, Any], branches: dict[str, Branch], default_branch_code: str, stats) -> dict[str, InventoryItem]:
    inventory_map: dict[str, InventoryItem] = {}
    for record in data.get("inventory", []):
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        item, _ = upsert_legacy_entity(
            session,
            InventoryItem,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "name": str(record.get("name", "")).strip(),
                "category": str(record.get("category", "")).strip(),
                "quantity": to_decimal(record.get("quantity")),
                "unit_price": to_decimal(record.get("unitPrice")),
                "mrp": to_decimal(record.get("mrp")),
                "last_updated": parse_datetime(record.get("lastUpdated")),
            },
            stats,
            "inventory_items",
        )
        inventory_map[legacy_id] = item
    return inventory_map


def import_expenses(session: Session, tenant: Tenant, data: dict[str, Any], branches: dict[str, Branch], default_branch_code: str, stats) -> None:
    for record in data.get("expenses", []):
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        upsert_legacy_entity(
            session,
            Expense,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "description": str(record.get("description", "")).strip(),
                "amount": to_decimal(record.get("amount")),
                "expense_date": parse_date(record.get("date")),
            },
            stats,
            "expenses",
        )


def import_employees(session: Session, tenant: Tenant, data: dict[str, Any], branches: dict[str, Branch], default_branch_code: str, stats) -> dict[str, Employee]:
    employee_map: dict[str, Employee] = {}
    for record in data.get("employees", []):
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        employee, _ = upsert_legacy_entity(
            session,
            Employee,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "name": str(record.get("name", "")).strip(),
                "phone": str(record.get("phone", "")).strip() or None,
                "type": normalize_employee_type(record.get("type")),
                "joined_date": parse_date(record.get("joinedDate")),
            },
            stats,
            "employees",
        )
        employee_map[legacy_id] = employee

        for work_log in record.get("workLogs", []) or []:
            work_legacy_id = str(work_log.get("id") or f"{legacy_id}:work:{work_log.get('date')}:{work_log.get('dressType')}")
            upsert_legacy_entity(
                session,
                EmployeeWorkLog,
                tenant.id,
                work_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "employee_id": employee.id,
                    "dress_type": str(work_log.get("dressType", "")).strip(),
                    "quantity": int(work_log.get("quantity") or 0),
                    "unit_price": to_decimal(work_log.get("unitPrice")),
                    "total_amount": to_decimal(work_log.get("totalAmount")),
                    "work_date": parse_date(work_log.get("date")),
                    "recorded_at": parse_datetime(work_log.get("timestamp")),
                    "start_hour": str(work_log.get("startHour", "")).strip() or None,
                    "end_hour": str(work_log.get("endHour", "")).strip() or None,
                    "salary_per_hour": to_decimal(work_log.get("salaryPerHour")) if work_log.get("salaryPerHour") not in (None, "") else None,
                },
                stats,
                "employee_work_logs",
            )

        for salary_payment in record.get("salaryPayments", []) or []:
            pay_legacy_id = str(salary_payment.get("id") or f"{legacy_id}:salary:{salary_payment.get('date')}")
            upsert_legacy_entity(
                session,
                EmployeeSalaryPayment,
                tenant.id,
                pay_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "employee_id": employee.id,
                    "amount": to_decimal(salary_payment.get("amount")),
                    "payment_date": parse_date(salary_payment.get("date")),
                    "recorded_at": parse_datetime(salary_payment.get("timestamp")),
                    "note": str(salary_payment.get("note", "")).strip() or None,
                },
                stats,
                "employee_salary_payments",
            )
    return employee_map


def import_suppliers(session: Session, tenant: Tenant, data: dict[str, Any], branches: dict[str, Branch], default_branch_code: str, stats) -> dict[str, Supplier]:
    supplier_map: dict[str, Supplier] = {}
    for record in data.get("suppliers", []):
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        supplier, _ = upsert_legacy_entity(
            session,
            Supplier,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "name": str(record.get("name", "")).strip(),
                "phone": str(record.get("phone", "")).strip() or None,
                "joined_date": parse_date(record.get("joinedDate")),
            },
            stats,
            "suppliers",
        )
        supplier_map[legacy_id] = supplier

        for purchase in record.get("purchases", []) or []:
            purchase_legacy_id = str(purchase.get("id") or f"{legacy_id}:purchase:{purchase.get('date')}")
            upsert_legacy_entity(
                session,
                SupplierPurchase,
                tenant.id,
                purchase_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "supplier_id": supplier.id,
                    "description": str(purchase.get("description", "")).strip(),
                    "quantity": to_decimal(purchase.get("quantity")) if purchase.get("quantity") not in (None, "") else None,
                    "unit_price": to_decimal(purchase.get("unitPrice")) if purchase.get("unitPrice") not in (None, "") else None,
                    "amount": to_decimal(purchase.get("amount")),
                    "purchase_date": parse_date(purchase.get("date")),
                    "recorded_at": parse_datetime(purchase.get("timestamp")),
                },
                stats,
                "supplier_purchases",
            )

        for payment in record.get("payments", []) or []:
            payment_legacy_id = str(payment.get("id") or f"{legacy_id}:payment:{payment.get('date')}")
            upsert_legacy_entity(
                session,
                SupplierPayment,
                tenant.id,
                payment_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "supplier_id": supplier.id,
                    "amount": to_decimal(payment.get("amount")),
                    "payment_date": parse_date(payment.get("date")),
                    "method": normalize_supplier_payment_method(payment.get("method")),
                    "recorded_at": parse_datetime(payment.get("timestamp")),
                    "note": str(payment.get("note", "")).strip() or None,
                },
                stats,
                "supplier_payments",
            )
    return supplier_map


def import_orders(
    session: Session,
    tenant: Tenant,
    data: dict[str, Any],
    branches: dict[str, Branch],
    customers: dict[str, Customer],
    default_branch_code: str,
    stats,
) -> dict[str, Order]:
    order_map: dict[str, Order] = {}
    for record in data.get("orders", []):
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        customer_legacy_id = str(record["customerId"])
        customer = customers.get(customer_legacy_id)
        if not customer:
            raise ValueError(f"Order {legacy_id} references missing customer {customer_legacy_id}")

        order, _order_created = upsert_legacy_entity(
            session,
            Order,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "customer_id": customer.id,
                "order_number": str(record.get("id")).strip(),
                "order_date": parse_date(record.get("orderDate")),
                "due_date": parse_date(record.get("dueDate")),
                "status": normalize_order_status(record.get("status")),
                "discount": to_decimal(record.get("discount")),
                "advance": to_decimal(record.get("advance")),
                "emergency": bool(record.get("emergency", False)),
                "is_called": bool(record.get("isCalled", False)),
                "called_timestamp": parse_datetime(record.get("calledTimestamp")),
                "call_history": list(record.get("callHistory", []) or []),
                "bag_count": int(record.get("bagCount")) if record.get("bagCount") not in (None, "") else None,
            },
            stats,
            "orders",
        )
        order_map[legacy_id] = order

        for index, item in enumerate(record.get("items", []) or []):
            item_legacy_id = str(item.get("id") or f"{legacy_id}:item:{index}")
            order_item, item_created = upsert_legacy_entity(
                session,
                OrderItem,
                tenant.id,
                item_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "order_id": order.id,
                    "dress_type": str(item.get("dressType", "")).strip(),
                    "cloth_name": str(item.get("clothName", "")).strip() or None,
                    "cloth_size": to_decimal(item.get("clothSize")) if item.get("clothSize") not in (None, "") else None,
                    "quantity": int(item.get("quantity") or 0),
                    "price_per_unit": to_decimal(item.get("pricePerUnit")),
                    "note": str(item.get("note", "")).strip() or None,
                    "is_cut": bool(item.get("isCut", False)),
                    "quality": str(item.get("quality", "")).strip() or None,
                    "completed_quantity": int(item.get("completedQuantity") or 0),
                    "completion_data": list(item.get("completionData", []) or []),
                    "completion_status": normalize_completion_status(item.get("completionStatus")),
                },
                stats,
                "order_items",
            )

            measurement_set_legacy = f"{item_legacy_id}:measurements"
            measurement_set = session.scalar(
                select(MeasurementSet).where(MeasurementSet.tenant_id == tenant.id, MeasurementSet.legacy_id == measurement_set_legacy)
            )
            if measurement_set:
                measurement_set.branch_id = branch.id
                measurement_set.customer_id = customer.id
                measurement_set.order_id = order.id
                measurement_set.order_item_id = order_item.id
                measurement_set.dress_type = order_item.dress_type
                measurement_set.note = order_item.note
                measurement_set.captured_at = parse_datetime(record.get("orderDate")) or datetime.combine(parse_date(record.get("orderDate")), datetime.min.time())
                stats["measurement_sets"]["updated"] += 1
            else:
                measurement_set = MeasurementSet(
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    legacy_id=measurement_set_legacy,
                    customer_id=customer.id,
                    order_id=order.id,
                    order_item_id=order_item.id,
                    dress_type=order_item.dress_type,
                    version_no=next_measurement_version(session, customer.id, order_item.dress_type),
                    note=order_item.note,
                    captured_at=parse_datetime(record.get("orderDate")) or datetime.combine(parse_date(record.get("orderDate")), datetime.min.time()),
                )
                session.add(measurement_set)
                session.flush()
                stats["measurement_sets"]["created"] += 1

            for measure_index, measurement in enumerate(item.get("measurements", []) or []):
                measurement_legacy_id = str(measurement.get("id") or f"{measurement_set_legacy}:{measure_index}")
                upsert_legacy_entity(
                    session,
                    MeasurementValue,
                    tenant.id,
                    measurement_legacy_id,
                    {
                        "tenant_id": tenant.id,
                        "branch_id": branch.id,
                        "measurement_set_id": measurement_set.id,
                        "name": str(measurement.get("name", "")).strip(),
                        "value": str(measurement.get("value", "")).strip() or None,
                        "sort_order": measure_index,
                    },
                    stats,
                    "measurement_values",
                )

        for payment_index, payment in enumerate(record.get("payments", []) or []):
            payment_legacy_id = str(payment.get("id") or f"{legacy_id}:payment:{payment_index}")
            payment_branch = branches[get_record_branch_code(payment, get_record_branch_code(record, default_branch_code))]
            upsert_legacy_entity(
                session,
                Payment,
                tenant.id,
                payment_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": payment_branch.id,
                    "order_id": order.id,
                    "collector_user_id": None,
                    "amount": to_decimal(payment.get("amount")),
                    "payment_date": parse_date(payment.get("date")),
                    "method": normalize_payment_method(payment.get("method")),
                    "note": str(payment.get("note", "")).strip() or None,
                },
                stats,
                "payments",
            )

        if not record.get("payments") and to_decimal(record.get("advance")) > 0:
            advance_legacy_id = f"{legacy_id}:advance"
            upsert_legacy_entity(
                session,
                Payment,
                tenant.id,
                advance_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "order_id": order.id,
                    "collector_user_id": None,
                    "amount": to_decimal(record.get("advance")),
                    "payment_date": parse_date(record.get("orderDate")),
                    "method": PaymentMethod.CASH,
                    "note": "Initial advance migrated from legacy order.advance",
                },
                stats,
                "payments",
            )
    return order_map


def import_material_sales(
    session: Session,
    tenant: Tenant,
    data: dict[str, Any],
    branches: dict[str, Branch],
    inventory_map: dict[str, InventoryItem],
    default_branch_code: str,
    stats,
) -> None:
    for record in data.get("materialSales", []) or []:
        legacy_id = str(record["id"])
        branch = branches[get_record_branch_code(record, default_branch_code)]
        sale, _ = upsert_legacy_entity(
            session,
            MaterialSale,
            tenant.id,
            legacy_id,
            {
                "tenant_id": tenant.id,
                "branch_id": branch.id,
                "sale_date": parse_date(record.get("date")),
                "total_amount": to_decimal(record.get("totalAmount")),
                "discount": to_decimal(record.get("discount")),
                "paid_amount": to_decimal(record.get("paidAmount")),
                "payment_method": normalize_payment_method(record.get("paymentMethod")),
                "customer_name": str(record.get("customerName", "")).strip() or None,
                "status": normalize_material_sale_status(record.get("status")),
            },
            stats,
            "material_sales",
        )

        for item_index, item in enumerate(record.get("items", []) or []):
            item_legacy_id = str(item.get("id") or f"{legacy_id}:item:{item_index}")
            source_legacy_id = str(item.get("itemId")).strip() if item.get("itemId") not in (None, "") else None
            inventory_item = inventory_map.get(source_legacy_id) if source_legacy_id else None
            upsert_legacy_entity(
                session,
                MaterialSaleItem,
                tenant.id,
                item_legacy_id,
                {
                    "tenant_id": tenant.id,
                    "branch_id": branch.id,
                    "material_sale_id": sale.id,
                    "inventory_item_id": inventory_item.id if inventory_item else None,
                    "source_inventory_legacy_id": source_legacy_id,
                    "category": str(item.get("category", "")).strip(),
                    "quantity": to_decimal(item.get("quantity")),
                    "unit_price": to_decimal(item.get("unitPrice")),
                    "cost_price": to_decimal(item.get("costPrice")),
                    "amount": to_decimal(item.get("amount")),
                },
                stats,
                "material_sale_items",
            )


def print_summary(stats: dict[str, dict[str, int]]) -> None:
    print("Migration summary:")
    for key in sorted(stats):
        print(f"- {key}: created={stats[key]['created']} updated={stats[key]['updated']}")


def main() -> None:
    args = parse_args()
    if not args.json_file.exists():
        raise FileNotFoundError(f"JSON file not found: {args.json_file}")

    settings = get_settings()
    database_url = args.database_url or settings.database_url
    engine = create_engine(database_url, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)

    if args.create_schema:
        Base.metadata.create_all(bind=engine)

    payload = load_json(args.json_file)
    stats: dict[str, dict[str, int]] = defaultdict(lambda: {"created": 0, "updated": 0})
    default_branch_code = normalize_branch_code(args.default_branch_code, args.default_branch_code)

    with SessionLocal.begin() as session:
        tenant = get_or_create_tenant(session, args.tenant_code, args.tenant_name, stats)

        branch_codes = collect_branch_codes(payload, default_branch_code)
        branches: dict[str, Branch] = {}
        for branch_code in sorted(branch_codes):
            branch_name = args.default_branch_name if branch_code == default_branch_code else normalize_branch_name(branch_code)
            branch = get_or_create_branch(session, tenant, branch_code, branch_name, stats)
            branches[branch_code] = branch

        customers = import_customers(session, tenant, payload, branches, default_branch_code, stats)
        inventory_map = import_inventory(session, tenant, payload, branches, default_branch_code, stats)
        import_expenses(session, tenant, payload, branches, default_branch_code, stats)
        import_employees(session, tenant, payload, branches, default_branch_code, stats)
        import_suppliers(session, tenant, payload, branches, default_branch_code, stats)
        import_orders(session, tenant, payload, branches, customers, default_branch_code, stats)
        import_material_sales(session, tenant, payload, branches, inventory_map, default_branch_code, stats)

    print_summary(stats)
    print("Legacy import completed successfully.")


if __name__ == "__main__":
    main()
