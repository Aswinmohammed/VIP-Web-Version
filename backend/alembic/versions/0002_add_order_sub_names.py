"""add optional sub-names to order items and payments

Revision ID: 0002_add_order_sub_names
Revises: 0001_baseline
Create Date: 2026-10-01 00:00:00.000000
"""

from alembic import op


revision = "0002_add_order_sub_names"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Some hosted databases were created before Alembic was run during deploy.
    # Make this revision safe when a manual compatibility repair already added a
    # column, while still recording the Alembic revision.
    op.execute("ALTER TABLE order_items ADD COLUMN IF NOT EXISTS sub_name VARCHAR(255)")
    op.execute("ALTER TABLE payments ADD COLUMN IF NOT EXISTS sub_name VARCHAR(255)")


def downgrade() -> None:
    op.drop_column("payments", "sub_name")
    op.drop_column("order_items", "sub_name")
