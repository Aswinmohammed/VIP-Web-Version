"""
Migration: Add 'Hold' value to the order_status PostgreSQL enum.

Run this script once on the live production database to fix the
"Internal Server Error" when creating/updating orders with Hold status.

Usage:
    python -m backend.scripts.migrate_add_hold_status
"""

from __future__ import annotations

import sys

from sqlalchemy import text

from backend.app.database import SessionLocal


def run_migration() -> None:
    db = SessionLocal()
    try:
        # Check if 'Hold' already exists in the enum
        result = db.execute(
            text(
                """
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'order_status'
                  AND e.enumlabel = 'Hold'
                """
            )
        ).fetchone()

        if result:
            print("✅ 'Hold' already exists in order_status enum — no migration needed.")
            return

        print("🔧 Adding 'Hold' to order_status enum…")
        # Must run outside a transaction for ALTER TYPE ADD VALUE in PostgreSQL < 14
        db.execute(text("COMMIT"))
        db.execute(
            text("ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress'")
        )
        print("✅ Migration complete — 'Hold' successfully added to order_status enum.")
    except Exception as exc:  # noqa: BLE001
        print(f"❌ Migration failed: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    run_migration()
