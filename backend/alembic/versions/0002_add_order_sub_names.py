"""add optional sub-names to order items and payments

Revision ID: 0002_add_order_sub_names
Revises: 0001_baseline
Create Date: 2026-10-01 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_add_order_sub_names"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("order_items", sa.Column("sub_name", sa.String(length=255), nullable=True))
    op.add_column("payments", sa.Column("sub_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("payments", "sub_name")
    op.drop_column("order_items", "sub_name")
