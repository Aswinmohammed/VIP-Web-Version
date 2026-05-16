import json
import logging
import time
from contextlib import asynccontextmanager

from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.database import engine
from backend.app.models import Base, OrderStatus, SmsCampaign, SmsLog, SmsSettings, SmsTemplate
from backend.app.services.files import save_json_backup, save_pdf_export
from sqlalchemy import event


def _register_psycopg3_enum_dumper(dbapi_connection, connection_record):
    """Register a custom psycopg3 Dumper for OrderStatus so it sends
    enum .value ('Hold') instead of .name ('HOLD') to PostgreSQL."""
    try:
        from psycopg.adapt import Dumper
        from psycopg.pq import Format

        class OrderStatusDumper(Dumper):
            format = Format.TEXT

            def dump(self, value):
                if hasattr(value, 'value'):
                    return value.value.encode()
                return str(value).encode()

        dbapi_connection.adapters.register_dumper(OrderStatus, OrderStatusDumper)
    except Exception as e:
        print(f"[startup] Warning: Could not register OrderStatus psycopg3 dumper: {e}")


event.listen(engine, "connect", _register_psycopg3_enum_dumper)


settings = get_settings()
logger = logging.getLogger("vip_tailors.api")


class SavePdfRequest(BaseModel):
    filename: str = "document.pdf"
    pdfData: str


class SaveBackupRequest(BaseModel):
    filename: str | None = None
    data: dict | list | str


def _table_exists(inspector, table_name: str) -> bool:
    return inspector.has_table(table_name)


def ensure_branch_access_columns() -> None:
    inspector = inspect(engine)
    if not _table_exists(inspector, "branches"):
        return

    statements = [
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS access_areas JSON NOT NULL DEFAULT '[]'::json",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS order_actions JSON NOT NULL DEFAULT '[]'::json",
        "ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_production_hub BOOLEAN NOT NULL DEFAULT FALSE",
        "UPDATE branches SET access_areas = '[]'::json WHERE access_areas IS NULL",
        "UPDATE branches SET order_actions = '[]'::json WHERE order_actions IS NULL",
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_employee_salary_columns() -> None:
    inspector = inspect(engine)
    if not _table_exists(inspector, "employees"):
        return

    dialect = engine.dialect.name
    statements = [
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary_source_branch_id UUID",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS piece_rates JSON",
        "ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_piece_rate_history JSON",
    ]

    if _table_exists(inspector, "employee_work_logs"):
        statements.extend(
            [
                "ALTER TABLE employee_work_logs ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE",
                "ALTER TABLE employee_work_logs ADD COLUMN IF NOT EXISTS source_branch_id UUID",
                "ALTER TABLE employee_work_logs ADD COLUMN IF NOT EXISTS source_order_id UUID",
                "ALTER TABLE employee_work_logs ADD COLUMN IF NOT EXISTS source_order_item_id UUID",
            ]
        )

    if dialect == "postgresql":
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
                connection.execute(text("ALTER TYPE employee_type ADD VALUE IF NOT EXISTS 'BRANCH_EMPLOYEE'"))
        except Exception as e:
            print(f"Warning: Failed to alter employee_type: {e}")

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def ensure_order_status_support() -> None:
    """Ensure the 'Hold' value exists in the order_status PostgreSQL enum.

    This is an idempotent migration that runs every startup.
    ALTER TYPE ... ADD VALUE must run outside a transaction in PostgreSQL.
    Non-fatal: logs errors but never crashes the app.
    """
    if engine.dialect.name != "postgresql":
        return

    def _read_enum_values(connection):
        result = connection.execute(
            text(
                """
                SELECT enumlabel FROM pg_enum
                JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
                WHERE typname = 'order_status'
                ORDER BY enumsortorder
                """
            )
        ).fetchall()
        return [row[0] for row in result]

    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            current_values = _read_enum_values(connection)
            print(f"[startup] order_status enum values: {current_values}")

            if not current_values:
                print("[startup] ⚠️  order_status enum type not found — will be created with tables.")
                return

            if "Hold" not in current_values:
                print("[startup] Adding 'Hold' to order_status enum...")
                connection.execute(
                    text("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress'")
                )
                updated_values = _read_enum_values(connection)
                if "Hold" in updated_values:
                    print(f"[startup] ✅ 'Hold' added successfully. Updated enum: {updated_values}")
                else:
                    print(f"[startup] ⚠️  'Hold' was not added — may need manual migration.")
                    print("[startup]    Run: ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress';")
            else:
                print("[startup] ✅ 'Hold' already present in order_status enum.")
    except Exception as e:
        # Non-fatal: log the error but allow the app to start normally.
        # The Hold feature may not work, but login and all other features will.
        print(f"[startup] ⚠️  order_status enum migration warning (non-fatal): {e}")
        print("[startup]    Manual fix: ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress';")



def ensure_sms_support_columns() -> None:
    inspector = inspect(engine)
    if _table_exists(inspector, "customers"):
        statements = [
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(32)",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS phone_valid BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT TRUE",
        ]
        with engine.begin() as connection:
            for statement in statements:
                connection.execute(text(statement))

    Base.metadata.create_all(
        bind=engine,
        tables=[
            SmsSettings.__table__,
            SmsTemplate.__table__,
            SmsCampaign.__table__,
            SmsLog.__table__,
        ],
    )

    from backend.app.services.sms import INTECH_GATEWAY_BASE_URL, INTECH_API_KEY_REFERENCE, INTECH_PROVIDER_NAME
    with engine.begin() as connection:
        connection.execute(
            text("""
                UPDATE sms_settings 
                SET api_base_url = :url,
                    api_key_ref = :ref,
                    provider_name = :name,
                    is_enabled = TRUE,
                    transactional_enabled = TRUE,
                    sender_id = 'VIP TAILORS'
                WHERE (api_base_url IS NULL OR api_base_url = '') 
                   OR (api_key_ref IS NULL OR api_key_ref = '')
            """),
            {"url": INTECH_GATEWAY_BASE_URL, "ref": INTECH_API_KEY_REFERENCE, "name": INTECH_PROVIDER_NAME}
        )


def ensure_inventory_and_order_material_columns() -> None:
    inspector = inspect(engine)
    dialect = engine.dialect.name
    inventory_statements = []
    order_item_statements = []

    if _table_exists(inspector, "inventory_items"):
        inventory_statements.extend(
            [
                "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_code VARCHAR(120)",
                "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS barcode_value VARCHAR(255)",
                "ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12, 2) NOT NULL DEFAULT 0",
                "UPDATE inventory_items SET category = 'Material' WHERE category IS NULL OR TRIM(category) = ''",
            ]
        )
        if dialect == "postgresql":
            inventory_statements.extend(
                [
                    "UPDATE inventory_items SET item_code = UPPER(REGEXP_REPLACE(COALESCE(name, 'ITEM'), '[^A-Za-z0-9]+', '-', 'g')) WHERE item_code IS NULL AND COALESCE(name, '') <> ''",
                    "UPDATE inventory_items SET barcode_value = item_code WHERE barcode_value IS NULL AND item_code IS NOT NULL",
                ]
            )
        else:
            inventory_statements.extend(
                [
                    "UPDATE inventory_items SET item_code = UPPER(COALESCE(name, 'ITEM')) WHERE item_code IS NULL AND COALESCE(name, '') <> ''",
                    "UPDATE inventory_items SET barcode_value = item_code WHERE barcode_value IS NULL AND item_code IS NOT NULL",
                ]
            )

    if _table_exists(inspector, "order_items"):
        order_item_statements.extend(
            [
                "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS inventory_item_id UUID",
                "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cloth_code VARCHAR(120)",
                "ALTER TABLE order_items ADD COLUMN IF NOT EXISTS stitch_fee NUMERIC(12, 2) NOT NULL DEFAULT 0",
            ]
        )

    with engine.begin() as connection:
        for statement in inventory_statements:
            connection.execute(text(statement))
        for statement in order_item_statements:
            connection.execute(text(statement))


def normalize_order_status_data() -> None:
    """One-time data migration: fix any orders stored with uppercase enum NAMES
    (e.g. 'PENDING', 'IN_PROGRESS') instead of the correct mixed-case VALUES
    (e.g. 'Pending', 'In Progress').
    Safe to run repeatedly — only updates rows that need it.
    Non-fatal: logs errors but never crashes the app.
    """
    if engine.dialect.name != "postgresql":
        return

    # Skip if orders table doesn't exist yet
    inspector = inspect(engine)
    if not _table_exists(inspector, "orders"):
        return

    status_map = {
        'PENDING':     'Pending',
        'HOLD':        'Hold',
        'IN_PROGRESS': 'In Progress',
        'COMPLETED':   'Completed',
        'PACKED':      'Packed',
        'DUE':         'Due',
        'DELIVERED':   'Delivered',
    }

    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            # Read current enum labels from pg_enum
            result = connection.execute(text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE typname = 'order_status'"
            )).fetchall()
            db_enum_values = {row[0] for row in result}
            print(f"[startup] order_status enum labels: {sorted(db_enum_values)}")

            if not db_enum_values:
                print("[startup] order_status enum not found, skipping data normalization.")
                return

            needs_column_cast = False

            for old_val, new_val in status_map.items():
                if old_val in db_enum_values:
                    if new_val in db_enum_values:
                        # Both labels exist — cast to text, migrate row data, cast back
                        if not needs_column_cast:
                            connection.execute(text(
                                "ALTER TABLE orders ALTER COLUMN status TYPE text"
                            ))
                            needs_column_cast = True
                        connection.execute(text(
                            f"UPDATE orders SET status = '{new_val}' WHERE status = '{old_val}'"
                        ))
                        print(f"[startup] Migrated row data '{old_val}' → '{new_val}'")
                    else:
                        # Only old label exists — rename it in the enum type
                        connection.execute(text(
                            f"ALTER TYPE order_status RENAME VALUE '{old_val}' TO '{new_val}'"
                        ))
                        print(f"[startup] Renamed enum label '{old_val}' → '{new_val}'")

            if needs_column_cast:
                connection.execute(text(
                    "ALTER TABLE orders ALTER COLUMN status TYPE order_status "
                    "USING status::order_status"
                ))
                print("[startup] Restored orders.status column type to order_status enum.")
            # Enum labels are already correct — check if any row data is stale (wrong case)
                try:
                    # Look for any row where the status text (case-insensitive) matches our known statuses
                    # but the actual case is not the canonical mixed-case version.
                    stale_check = connection.execute(text(
                        "SELECT DISTINCT status::text FROM orders "
                        "WHERE LOWER(status::text) IN ('pending','in_progress','completed','packed','due','delivered','hold') "
                        "AND status::text NOT IN ('Pending','In Progress','Completed','Packed','Due','Delivered','Hold')"
                    )).fetchall()
                    stale_values = [row[0] for row in stale_check]
 
                    if stale_values:
                        print(f"[startup] Found stale/wrong-case status values in rows: {stale_values} — fixing...")
                        connection.execute(text(
                            "ALTER TABLE orders ALTER COLUMN status TYPE text"
                        ))
                        # Create a case-insensitive map
                        ci_status_map = {k.lower(): v for k, v in status_map.items()}
                        # Also add the mixed-case values as keys to be safe
                        for v in status_map.values():
                            ci_status_map[v.lower()] = v

                        for old_val_lower, canonical_val in ci_status_map.items():
                            connection.execute(text(
                                f"UPDATE orders SET status = '{canonical_val}' WHERE LOWER(status) = '{old_val_lower}' AND status <> '{canonical_val}'"
                            ))
                        
                        connection.execute(text(
                            "ALTER TABLE orders ALTER COLUMN status TYPE order_status "
                            "USING status::order_status"
                        ))
                        print("[startup] Restored orders.status column type after row fix.")
                except Exception as stale_err:
                    # Stale check failed (e.g. column is already text from a previous partial run)
                    # Try to restore the column type if it's stuck as text
                    print(f"[startup] Stale check warning: {stale_err}")
                    try:
                        connection.execute(text(
                            "ALTER TABLE orders ALTER COLUMN status TYPE order_status "
                            "USING status::order_status"
                        ))
                        print("[startup] Restored orders.status column type (recovery).")
                    except Exception:
                        pass

            print("[startup] ✅ Order status data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Status normalization warning (non-fatal): {e}")


def normalize_user_role_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    if not _table_exists(inspector, "users"):
        return
    role_map = {
        'MASTER_ADMIN': 'master_admin',
        'BRANCH_ADMIN': 'branch_admin',
    }
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            result = connection.execute(text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE typname = 'user_role'"
            )).fetchall()
            db_enum_values = {row[0] for row in result}
            if not db_enum_values:
                return
            for old_val, new_val in role_map.items():
                if old_val in db_enum_values:
                    if new_val in db_enum_values:
                        connection.execute(text("ALTER TABLE users ALTER COLUMN role TYPE text"))
                        connection.execute(text(f"UPDATE users SET role = '{new_val}' WHERE role = '{old_val}'"))
                        connection.execute(text("ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role"))
                    else:
                        connection.execute(text(f"ALTER TYPE user_role RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ User role data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  User role normalization warning: {e}")


def normalize_employee_type_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    if not _table_exists(inspector, "employees"):
        return
    type_map = {
        'CUT_BASE': 'CutBase',
        'HOUR_BASE': 'HourBase',
        'BRANCH_EMPLOYEE': 'BranchEmployee',
    }
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            result = connection.execute(text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE typname = 'employee_type'"
            )).fetchall()
            db_enum_values = {row[0] for row in result}
            if not db_enum_values:
                return
            for old_val, new_val in type_map.items():
                if old_val in db_enum_values:
                    if new_val in db_enum_values:
                        connection.execute(text("ALTER TABLE employees ALTER COLUMN type TYPE text"))
                        connection.execute(text(f"UPDATE employees SET type = '{new_val}' WHERE type = '{old_val}'"))
                        connection.execute(text("ALTER TABLE employees ALTER COLUMN type TYPE employee_type USING type::employee_type"))
                    else:
                        connection.execute(text(f"ALTER TYPE employee_type RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ Employee type data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Employee type normalization warning: {e}")


def normalize_completion_status_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    if not _table_exists(inspector, "order_items"):
        return
    status_map = {
        'PENDING': 'pending',
        'PARTIAL': 'partial',
        'COMPLETED': 'completed',
    }
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            result = connection.execute(text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE typname = 'completion_status'"
            )).fetchall()
            db_enum_values = {row[0] for row in result}
            if not db_enum_values:
                return
            for old_val, new_val in status_map.items():
                if old_val in db_enum_values:
                    if new_val in db_enum_values:
                        connection.execute(text("ALTER TABLE order_items ALTER COLUMN completion_status TYPE text"))
                        connection.execute(text(f"UPDATE order_items SET completion_status = '{new_val}' WHERE completion_status = '{old_val}'"))
                        connection.execute(text("ALTER TABLE order_items ALTER COLUMN completion_status TYPE completion_status USING completion_status::completion_status"))
                    else:
                        connection.execute(text(f"ALTER TYPE completion_status RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ Completion status data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Completion status normalization warning: {e}")


def normalize_payment_method_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    payment_map = {
        'CASH': 'Cash',
        'CARD': 'Card',
        'BANK_TRANSFER': 'Bank Transfer',
        'CHEQUE': 'Cheque',
    }
    # Tables with payment method: payments, material_sales
    tables = [("payments", "method", "payment_method"), ("material_sales", "payment_method", "material_sale_payment_method")]
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            for table_name, col_name, type_name in tables:
                if not _table_exists(inspector, table_name):
                    continue
                result = connection.execute(text(
                    f"SELECT enumlabel FROM pg_enum "
                    f"JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                    f"WHERE typname = '{type_name}'"
                )).fetchall()
                db_enum_values = {row[0] for row in result}
                if not db_enum_values:
                    continue
                for old_val, new_val in payment_map.items():
                    if old_val in db_enum_values:
                        if new_val in db_enum_values:
                            connection.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN {col_name} TYPE text"))
                            connection.execute(text(f"UPDATE {table_name} SET {col_name} = '{new_val}' WHERE {col_name} = '{old_val}'"))
                            connection.execute(text(f"ALTER TABLE {table_name} ALTER COLUMN {col_name} TYPE {type_name} USING {col_name}::{type_name}"))
                        else:
                            connection.execute(text(f"ALTER TYPE {type_name} RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ Payment method data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Payment method normalization warning: {e}")


def normalize_material_sale_status_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    if not _table_exists(inspector, "material_sales"):
        return
    status_map = {
        'PAID': 'Paid',
        'DUE': 'Due',
    }
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            result = connection.execute(text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE typname = 'material_sale_status'"
            )).fetchall()
            db_enum_values = {row[0] for row in result}
            if not db_enum_values:
                return
            for old_val, new_val in status_map.items():
                if old_val in db_enum_values:
                    if new_val in db_enum_values:
                        connection.execute(text("ALTER TABLE material_sales ALTER COLUMN status TYPE text"))
                        connection.execute(text(f"UPDATE material_sales SET status = '{new_val}' WHERE status = '{old_val}'"))
                        connection.execute(text("ALTER TABLE material_sales ALTER COLUMN status TYPE material_sale_status USING status::material_sale_status"))
                    else:
                        connection.execute(text(f"ALTER TYPE material_sale_status RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ Material sale status data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Material sale status normalization warning: {e}")


def normalize_sms_enum_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    
    # SMS Template Categories
    if _table_exists(inspector, "sms_templates"):
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
                cat_map = {'TRANSACTIONAL': 'transactional', 'MARKETING': 'marketing', 'FESTIVAL': 'festival'}
                result = connection.execute(text(
                    "SELECT enumlabel FROM pg_enum "
                    "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                    "WHERE typname = 'sms_template_category'"
                )).fetchall()
                db_enum_values = {row[0] for row in result}
                if db_enum_values:
                    for old_val, new_val in cat_map.items():
                        if old_val in db_enum_values:
                            if new_val in db_enum_values:
                                connection.execute(text("ALTER TABLE sms_templates ALTER COLUMN category TYPE text"))
                                connection.execute(text(f"UPDATE sms_templates SET category = '{new_val}' WHERE category = '{old_val}'"))
                                connection.execute(text("ALTER TABLE sms_templates ALTER COLUMN category TYPE sms_template_category USING category::sms_template_category"))
                            else:
                                connection.execute(text(f"ALTER TYPE sms_template_category RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ SMS template category normalization complete.")
        except Exception as e:
            print(f"[startup] ⚠️  SMS template category normalization warning: {e}")

    # SMS Log Status
    if _table_exists(inspector, "sms_logs"):
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
                status_map = {
                    'QUEUED': 'queued', 'SENDING': 'sending', 'SENT': 'sent', 
                    'DELIVERED': 'delivered', 'FAILED': 'failed', 'SKIPPED': 'skipped', 'CANCELLED': 'cancelled'
                }
                result = connection.execute(text(
                    "SELECT enumlabel FROM pg_enum "
                    "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                    "WHERE typname = 'sms_log_status'"
                )).fetchall()
                db_enum_values = {row[0] for row in result}
                if db_enum_values:
                    for old_val, new_val in status_map.items():
                        if old_val in db_enum_values:
                            if new_val in db_enum_values:
                                connection.execute(text("ALTER TABLE sms_logs ALTER COLUMN status TYPE text"))
                                connection.execute(text(f"UPDATE sms_logs SET status = '{new_val}' WHERE status = '{old_val}'"))
                                connection.execute(text("ALTER TABLE sms_logs ALTER COLUMN status TYPE sms_log_status USING status::sms_log_status"))
                            else:
                                connection.execute(text(f"ALTER TYPE sms_log_status RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ SMS log status normalization complete.")
        except Exception as e:
            print(f"[startup] ⚠️  SMS log status normalization warning: {e}")

    # SMS Campaign Status
    if _table_exists(inspector, "sms_campaigns"):
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
                status_map = {'DRAFT': 'draft', 'SCHEDULED': 'scheduled', 'RUNNING': 'running', 'COMPLETED': 'completed', 'CANCELLED': 'cancelled'}
                result = connection.execute(text(
                    "SELECT enumlabel FROM pg_enum "
                    "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                    "WHERE typname = 'sms_campaign_status'"
                )).fetchall()
                db_enum_values = {row[0] for row in result}
                if db_enum_values:
                    for old_val, new_val in status_map.items():
                        if old_val in db_enum_values:
                            if new_val in db_enum_values:
                                connection.execute(text("ALTER TABLE sms_campaigns ALTER COLUMN status TYPE text"))
                                connection.execute(text(f"UPDATE sms_campaigns SET status = '{new_val}' WHERE status = '{old_val}'"))
                                connection.execute(text("ALTER TABLE sms_campaigns ALTER COLUMN status TYPE sms_campaign_status USING status::sms_campaign_status"))
                            else:
                                connection.execute(text(f"ALTER TYPE sms_campaign_status RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ SMS campaign status normalization complete.")
        except Exception as e:
            print(f"[startup] ⚠️  SMS campaign status normalization warning: {e}")


def normalize_supplier_enum_data() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    if not _table_exists(inspector, "supplier_payments"):
        return
    payment_map = {'CHEQUE': 'Cheque', 'BANK_TRANSFER': 'Bank Transfer', 'MONEY': 'Money'}
    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            result = connection.execute(text(
                "SELECT enumlabel FROM pg_enum "
                "JOIN pg_type ON pg_type.oid = pg_enum.enumtypid "
                "WHERE typname = 'supplier_payment_method'"
            )).fetchall()
            db_enum_values = {row[0] for row in result}
            if db_enum_values:
                for old_val, new_val in payment_map.items():
                    if old_val in db_enum_values:
                        if new_val in db_enum_values:
                            connection.execute(text("ALTER TABLE supplier_payments ALTER COLUMN method TYPE text"))
                            connection.execute(text(f"UPDATE supplier_payments SET method = '{new_val}' WHERE method = '{old_val}'"))
                            connection.execute(text("ALTER TABLE supplier_payments ALTER COLUMN method TYPE supplier_payment_method USING method::supplier_payment_method"))
                        else:
                            connection.execute(text(f"ALTER TYPE supplier_payment_method RENAME VALUE '{old_val}' TO '{new_val}'"))
            print("[startup] ✅ Supplier payment method normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Supplier payment method normalization warning: {e}")


def ensure_master_admin_rls_visibility() -> None:
    """Ensure master admin and production hubs can see rows hidden by strict branch RLS.
    """
    if engine.dialect.name != "postgresql":
        return

    inspector = inspect(engine)
    branch_scoped_tables = [
        "customers",
        "orders",
        "order_items",
        "measurement_sets",
        "measurement_values",
        "payments",
        "inventory_items",
        "expenses",
        "material_sales",
        "material_sale_items",
        "employees",
        "employee_work_logs",
        "employee_salary_payments",
        "suppliers",
        "supplier_purchases",
        "supplier_payments",
    ]

    try:
        with engine.begin() as connection:
            for table_name in branch_scoped_tables:
                if not _table_exists(inspector, table_name):
                    continue

                policy_name = f"tenant_branch_isolation_{table_name}"
                connection.execute(text(f"DROP POLICY IF EXISTS {policy_name} ON {table_name}"))
                connection.execute(
                    text(
                        f"""
                        CREATE POLICY {policy_name} ON {table_name}
                            USING (
                                NULLIF(current_setting('app.current_role', true), '') = 'master_admin'
                                OR (
                                    tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
                                    AND (
                                        NULLIF(current_setting('app.is_production_hub', true), '') = 'true'
                                        OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')
                                    )
                                )
                            )
                            WITH CHECK (
                                NULLIF(current_setting('app.current_role', true), '') = 'master_admin'
                                OR (
                                    tenant_id::text = NULLIF(current_setting('app.current_tenant_id', true), '')
                                    AND (
                                        NULLIF(current_setting('app.is_production_hub', true), '') = 'true'
                                        OR branch_id::text = NULLIF(current_setting('app.current_branch_id', true), '')
                                    )
                                )
                            )
                        """
                    )
                )
        print("[startup] Master admin RLS visibility policies ensured.")
    except Exception as e:
        print(f"[startup] Master admin RLS visibility policy warning: {e}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.create_tables_on_startup:
        Base.metadata.create_all(bind=engine)
    ensure_branch_access_columns()
    ensure_employee_salary_columns()
    ensure_master_admin_rls_visibility()
    normalize_order_status_data()
    normalize_user_role_data()
    normalize_employee_type_data()
    normalize_completion_status_data()
    normalize_payment_method_data()
    normalize_material_sale_status_data()
    normalize_sms_enum_data()
    normalize_supplier_enum_data()
    ensure_order_status_support()
    ensure_sms_support_columns()
    ensure_inventory_and_order_material_columns()
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=False,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        elapsed_ms = (time.perf_counter() - start_time) * 1000
        logger.exception(
            "Unhandled API error method=%s path=%s elapsed_ms=%.2f",
            request.method,
            request.url.path,
            elapsed_ms,
        )
        raise

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    if response.status_code >= 500:
        logger.error(
            "Server error response method=%s path=%s status=%s elapsed_ms=%.2f",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    elif elapsed_ms > 1500:
        logger.warning(
            "Slow API response method=%s path=%s status=%s elapsed_ms=%.2f",
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    logger.warning("Request validation failed: %s", exc.errors())
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=jsonable_encoder({"detail": "Invalid request payload", "errors": exc.errors()}),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception("Unhandled application exception")
    if settings.environment == "production":
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": str(exc)},
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "environment": settings.environment}


@app.post("/api/save-pdf")
def save_pdf(payload: SavePdfRequest) -> dict[str, str]:
    try:
        file_path = save_pdf_export(payload.pdfData, payload.filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return {"status": "success", "path": str(file_path)}


@app.post("/api/save-backup")
def save_backup(payload: SaveBackupRequest) -> dict[str, str]:
    try:
        file_path = save_json_backup(payload.data, payload.filename)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Backup data must be valid JSON") from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    return {"status": "success", "path": str(file_path)}
