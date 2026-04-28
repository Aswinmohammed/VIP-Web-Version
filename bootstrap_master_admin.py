from __future__ import annotations

import argparse

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core.config import get_settings
from backend.app.models import Base, Tenant, User, UserRole
from backend.app.security import hash_password


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create or update the initial master admin for a tenant.")
    parser.add_argument("--tenant-code", required=True)
    parser.add_argument("--tenant-name", required=True)
    parser.add_argument("--username", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--create-schema", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    settings = get_settings()
    engine = create_engine(args.database_url or settings.database_url, future=True)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, class_=Session)

    if args.create_schema:
        Base.metadata.create_all(bind=engine)

    with SessionLocal.begin() as session:
        tenant = session.scalar(select(Tenant).where(Tenant.code == args.tenant_code))
        if tenant is None:
            tenant = Tenant(code=args.tenant_code, name=args.tenant_name, is_active=True)
            session.add(tenant)
            session.flush()
        else:
            tenant.name = args.tenant_name
            tenant.is_active = True

        user = session.scalar(select(User).where(User.tenant_id == tenant.id, User.username == args.username))
        if user is None:
            user = User(
                tenant_id=tenant.id,
                branch_id=None,
                username=args.username,
                password_hash=hash_password(args.password),
                role=UserRole.MASTER_ADMIN,
                is_active=True,
            )
            session.add(user)
            action = "created"
        else:
            user.password_hash = hash_password(args.password)
            user.role = UserRole.MASTER_ADMIN
            user.branch_id = None
            user.is_active = True
            action = "updated"

    print(f"Master admin {action} for tenant {args.tenant_code}.")


if __name__ == "__main__":
    main()
