"""baseline existing VIP Tailors schema

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-22 00:00:00.000000
"""

from pathlib import Path

from alembic import op

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def _read_sql(relative_path: str) -> str:
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / relative_path).read_text(encoding="utf-8")


def upgrade() -> None:
    bind = op.get_bind()
    bind.exec_driver_sql(_read_sql("backend/app/sql/schema.sql"))
    bind.exec_driver_sql(_read_sql("backend/app/sql/rls_policies.sql"))


def downgrade() -> None:
    raise NotImplementedError("Downgrading the baseline schema is intentionally disabled; restore a database backup instead.")
