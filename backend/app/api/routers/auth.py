from __future__ import annotations

import json
import tempfile
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from backend.app.database import get_db, engine
from backend.app.models import Tenant, User
from backend.app.schemas import LoginRequest, RefreshTokenRequest, TokenResponse, TokenUser
from backend.app.security import (
    JWTError,
    create_access_token,
    create_refresh_token,
    decode_token,
    validate_token_type,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    tenant = db.scalar(select(Tenant).where(Tenant.code == payload.tenant_code, Tenant.is_active.is_(True)))
    if not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant or credentials")

    user = db.scalar(
        select(User).where(
            User.tenant_id == tenant.id,
            User.username == payload.username,
            User.is_active.is_(True),
        )
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid tenant or credentials")

    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=TokenUser.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh_tokens(payload: RefreshTokenRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        token_payload = decode_token(payload.refresh_token)
        validate_token_type(token_payload, "refresh")
        actor_id = uuid.UUID(token_payload["sub"])
        tenant_id = uuid.UUID(token_payload["tenant_id"])
    except (KeyError, ValueError, JWTError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc

    user = db.scalar(select(User).where(User.id == actor_id, User.tenant_id == tenant_id, User.is_active.is_(True)))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    return TokenResponse(
        access_token=create_access_token(user),
        refresh_token=create_refresh_token(user),
        user=TokenUser.model_validate(user),
    )


@router.get("/debug-orders")
def debug_orders(db: Session = Depends(get_db)):
    """Count all orders in the database across all tenants."""
    try:
        total_orders = db.scalar(text("SELECT count(*) FROM orders"))
        tenant_counts = db.execute(
            text("SELECT tenant_id, count(*) FROM orders GROUP BY tenant_id")
        ).fetchall()
        return {
            "total_orders": total_orders,
            "tenant_counts": [{"tenant_id": str(t[0]), "count": t[1]} for t in tenant_counts],
        }
    except Exception as e:
        return {"error": str(e)}


@router.get("/fix-tenant")
def fix_tenant(code: str | None = None, db: Session = Depends(get_db)):
    """Force moves ALL data to the correct tenant."""
    try:
        my_tenant_id = None
        if code:
            my_tenant_id = db.scalar(text("SELECT id FROM tenants WHERE code = :code"), {"code": code})

        if not my_tenant_id:
            my_tenant_id = db.scalar(
                text("SELECT tenant_id FROM users WHERE role = 'master_admin' ORDER BY created_at ASC LIMIT 1")
            )
        if not my_tenant_id:
            my_tenant_id = db.scalar(text("SELECT tenant_id FROM users LIMIT 1"))

        if not my_tenant_id:
            return {"status": "error", "detail": "No tenant found in the database."}

        inspector = inspect(engine)

        with engine.begin() as connection:
            # Fix branches
            connection.execute(text("UPDATE branches SET tenant_id = :tid"), {"tid": my_tenant_id})
            connection.execute(
                text("UPDATE branches SET is_production_hub = TRUE WHERE name ILIKE '%Kalmunai%'")
            )
            # Fix all data tables — no WHERE filter, move everything
            tables_to_fix = ["orders", "customers", "order_items", "payments", "inventory_items", "employees", "expenses"]
            for table in tables_to_fix:
                if inspector.has_table(table):
                    connection.execute(text(f"UPDATE {table} SET tenant_id = :tid"), {"tid": my_tenant_id})
            # Fix users
            connection.execute(text("UPDATE users SET tenant_id = :tid"), {"tid": my_tenant_id})

            # Fix orders whose branch_id points to a non-existent branch → assign to production hub
            connection.execute(text("""
                UPDATE orders
                SET branch_id = (
                    SELECT id FROM branches
                    WHERE tenant_id = :tid AND is_production_hub = TRUE
                    LIMIT 1
                )
                WHERE branch_id NOT IN (SELECT id FROM branches WHERE tenant_id = :tid)
            """), {"tid": my_tenant_id})


        # Gather diagnostics
        global_count = db.scalar(text("SELECT count(*) FROM orders"))
        tenant_count = db.scalar(text("SELECT count(*) FROM orders WHERE tenant_id = :tid"), {"tid": my_tenant_id})
        branches = db.execute(
            text("SELECT id, name, is_production_hub FROM branches WHERE tenant_id = :tid"), {"tid": my_tenant_id}
        ).fetchall()
        users = db.execute(
            text("SELECT id, username, role, branch_id FROM users WHERE tenant_id = :tid"), {"tid": my_tenant_id}
        ).fetchall()

        return {
            "status": "success",
            "tenant_id": str(my_tenant_id),
            "global_order_count": global_count,
            "tenant_order_count": tenant_count,
            "branches": [{"id": str(b[0]), "name": b[1], "is_hub": b[2]} for b in branches],
            "users": [{"id": str(u[0]), "username": u[1], "role": u[2], "branch_id": str(u[3]) if u[3] else None} for u in users],
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.post("/import-json")
async def import_json(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Upload a legacy JSON backup file and import all data into the database."""
    try:
        contents = await file.read()
        data = json.loads(contents)

        # Import inline using the same logic as migrate_legacy_json.py
        import sys
        sys.path.insert(0, "/app")
        from collections import defaultdict
        import migrate_legacy_json as mig

        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from backend.app.database import engine as db_engine
        from backend.app.core.config import get_settings

        stats = defaultdict(lambda: {"created": 0, "updated": 0})
        SessionLocal = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)

        with SessionLocal.begin() as session:
            tenant = mig.get_or_create_tenant(session, "vip", "VIP Tailors", stats)
            branch_codes = mig.collect_branch_codes(data, "KLM")
            branches = {}
            for branch_code in sorted(branch_codes):
                branch_name = "KALMUNAI" if branch_code == "KLM" else mig.normalize_branch_name(branch_code)
                branches[branch_code] = mig.get_or_create_branch(session, tenant, branch_code, branch_name, stats)
            # Mark production hub
            for branch in branches.values():
                if branch.code == "KLM":
                    branch.is_production_hub = True

            customers = mig.import_customers(session, tenant, data, branches, "KLM", stats)
            inventory_map = mig.import_inventory(session, tenant, data, branches, "KLM", stats)
            mig.import_expenses(session, tenant, data, branches, "KLM", stats)
            mig.import_employees(session, tenant, data, branches, "KLM", stats)
            mig.import_suppliers(session, tenant, data, branches, "KLM", stats)
            mig.import_orders(session, tenant, data, branches, customers, "KLM", stats)
            mig.import_material_sales(session, tenant, data, branches, inventory_map, "KLM", stats)

        summary = {k: v for k, v in stats.items()}
        return {"status": "success", "summary": summary}
    except Exception as e:
        import traceback
        return {"status": "error", "detail": str(e), "trace": traceback.format_exc()}
