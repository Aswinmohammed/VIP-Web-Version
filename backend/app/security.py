from __future__ import annotations

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from backend.app.core.config import get_settings
from backend.app.models import User


settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, password_hash: str) -> bool:
    return pwd_context.verify(plain_password, password_hash)


def _build_token(user: User, expires_delta: timedelta, token_type: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "branch_id": str(user.branch_id) if user.branch_id else None,
        "role": user.role.value,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int((now + expires_delta).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(user: User) -> str:
    return _build_token(user, timedelta(minutes=settings.access_token_expires_minutes), "access")


def create_refresh_token(user: User) -> str:
    return _build_token(user, timedelta(days=settings.refresh_token_expires_days), "refresh")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def validate_token_type(payload: dict, expected_type: str) -> None:
    actual_type = payload.get("type")
    if actual_type != expected_type:
        raise JWTError(f"Expected {expected_type} token, got {actual_type}")
