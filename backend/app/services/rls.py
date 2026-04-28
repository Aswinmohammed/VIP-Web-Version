from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def set_rls_context(db: Session, tenant_id: str, role: str, branch_id: str | None) -> None:
    db.execute(text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"), {"tenant_id": tenant_id})
    db.execute(text("SELECT set_config('app.current_role', :role, true)"), {"role": role})
    db.execute(
        text("SELECT set_config('app.current_branch_id', :branch_id, true)"),
        {"branch_id": branch_id or ""},
    )
