import json
from contextlib import asynccontextmanager

from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from backend.app.api.router import api_router
from backend.app.core.config import get_settings
from backend.app.database import engine
from backend.app.models import Base, SmsCampaign, SmsLog, SmsSettings, SmsTemplate
from backend.app.services.files import save_json_backup, save_pdf_export


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
    if engine.dialect.name != "postgresql":
        return

    try:
        with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.execute(text("ALTER TYPE orderstatus ADD VALUE IF NOT EXISTS 'Hold'"))
    except Exception as e:
        print(f"Warning: Failed to alter orderstatus: {e}")


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


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.create_tables_on_startup:
        Base.metadata.create_all(bind=engine)
    ensure_branch_access_columns()
    ensure_employee_salary_columns()
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
