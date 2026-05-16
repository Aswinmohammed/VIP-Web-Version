from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.database import get_db, engine
from backend.app.models import Tenant, User
from backend.app.schemas import LoginRequest, RefreshTokenRequest, TokenResponse, TokenUser
from backend.app.security import JWTError, create_access_token, create_refresh_token, decode_token, validate_token_type, verify_password
from backend.app.dependencies import get_current_actor
from sqlalchemy import text, inspect

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


@router.get("/fix-tenant")
def fix_tenant(actor = Depends(get_current_actor)):
    """Force moves all branches, orders, and customers to the logged-in user's tenant."""
    try:
        my_tenant_id = actor.tenant_id
        inspector = inspect(engine)
        
        with engine.begin() as connection:
            # 1. Move all branches to this tenant
            connection.execute(
                text("UPDATE branches SET tenant_id = :tid WHERE tenant_id <> :tid"),
                {"tid": my_tenant_id}
            )
            # 2. Fix Kalmunai
            connection.execute(
                text("UPDATE branches SET is_production_hub = TRUE WHERE name ILIKE '%Kalmunai%'")
            )
            # 3. Move all other tables
            tables_to_fix = ["orders", "customers", "order_items", "payments", "inventory_items", "employees", "expenses"]
            for table in tables_to_fix:
                if inspector.has_table(table):
                    connection.execute(
                        text(f"UPDATE {table} SET tenant_id = :tid WHERE tenant_id <> :tid"),
                        {"tid": my_tenant_id}
                    )
        return {"status": "success", "message": f"All data moved to your tenant: {my_tenant_id}"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
