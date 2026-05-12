import json
from contextlib import asynccontextmanager

from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
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
                    text("ALTER TYPE order_status ADD VALUE 'Hold' BEFORE 'In Progress'")
                )
                # Verify the addition was successful
                updated_values = _read_enum_values(connection)
                if "Hold" in updated_values:
                    print(f"[startup] ✅ 'Hold' added successfully. Updated enum: {updated_values}")
                else:
                    print(f"[startup] ❌ CRITICAL: 'Hold' was NOT added despite no error! Enum: {updated_values}")
                    raise RuntimeError(
                        "Failed to add 'Hold' to order_status enum — "
                        "please run the migration SQL manually: "
                        "ALTER TYPE order_status ADD VALUE 'Hold' BEFORE 'In Progress';"
                    )
            else:
                print("[startup] ✅ 'Hold' already present in order_status enum.")
    except RuntimeError:
        raise
    except Exception as e:
        print(f"[startup] ❌ CRITICAL: Failed to migrate order_status enum: {e}")
        print("[startup]    The 'Hold' feature will NOT work until this is resolved.")
        print("[startup]    Manual fix: connect to PostgreSQL and run:")
        print("[startup]    ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress';")
        raise RuntimeError(f"order_status enum migration failed: {e}") from e



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
    This repairs data written by buggy deployments using enum .name instead of .value.
    Safe to run repeatedly — only updates rows that need it.

    Strategy:
    1. If the old uppercase label exists as an enum type value → UPDATE rows then
       optionally rename the label.
    2. If the old label does NOT exist as an enum type value but rows contain it
       as raw text (possible after a partial migration) → cast column to text,
       UPDATE, cast back.
    """
    if engine.dialect.name != "postgresql":
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

            needs_column_cast = False

            for old_val, new_val in status_map.items():
                if old_val in db_enum_values:
                    if new_val in db_enum_values:
                        # Both labels exist — migrate row data, then drop old label
                        # Cast through text to avoid enum constraint during UPDATE
                        connection.execute(text(
                            "ALTER TABLE orders ALTER COLUMN status TYPE text"
                        ))
                        connection.execute(text(
                            f"UPDATE orders SET status = '{new_val}' WHERE status = '{old_val}'"
                        ))
                        needs_column_cast = True
                        print(f"[startup] Migrated row data '{old_val}' → '{new_val}'")
                    else:
                        # Only old label exists — rename it in the enum type
                        connection.execute(text(
                            f"ALTER TYPE order_status RENAME VALUE '{old_val}' TO '{new_val}'"
                        ))
                        print(f"[startup] Renamed enum label '{old_val}' → '{new_val}'")

            if needs_column_cast:
                # Restore the column type back to the enum
                connection.execute(text(
                    "ALTER TABLE orders ALTER COLUMN status TYPE order_status "
                    "USING status::order_status"
                ))
                print("[startup] Restored orders.status column type to order_status enum.")

            # Also fix rows where the data is the old uppercase string but the
            # enum type already has the correct mixed-case labels (partial migration).
            # We do this by temporarily casting to text, updating, then casting back.
            else:
                # Check if any rows have stale uppercase values that aren't valid enum labels
                stale_check = connection.execute(text(
                    "SELECT DISTINCT status::text FROM orders "
                    "WHERE status::text = ANY(ARRAY['PENDING','IN_PROGRESS','COMPLETED',"
                    "'PACKED','DUE','DELIVERED','HOLD'])"
                )).fetchall()
                stale_values = [row[0] for row in stale_check]

                if stale_values:
                    print(f"[startup] Found stale status values in rows: {stale_values} — fixing...")
                    connection.execute(text(
                        "ALTER TABLE orders ALTER COLUMN status TYPE text"
                    ))
                    for old_val, new_val in status_map.items():
                        connection.execute(text(
                            f"UPDATE orders SET status = '{new_val}' WHERE status = '{old_val}'"
                        ))
                        print(f"[startup] Fixed row data '{old_val}' → '{new_val}'")
                    connection.execute(text(
                        "ALTER TABLE orders ALTER COLUMN status TYPE order_status "
                        "USING status::order_status"
                    ))
                    print("[startup] Restored orders.status column type after row fix.")

            print("[startup] ✅ Order status data normalization complete.")
    except Exception as e:
        print(f"[startup] ⚠️  Status normalization warning (non-fatal): {e}")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.create_tables_on_startup:
        Base.metadata.create_all(bind=engine)
    ensure_branch_access_columns()
    ensure_employee_salary_columns()
    normalize_order_status_data()
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
