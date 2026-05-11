"""
Production Enum Fix Script
==========================
Fixes all enum type mismatches in the production database.
Adds 'Hold' to order_status and converts all enum values
from Python key names (PENDING) to display values (Pending).

Usage:
    python backend/scripts/fix_production_enums.py <DATABASE_URL>

Example:
    python backend/scripts/fix_production_enums.py "postgresql+psycopg://user:pass@host:5432/vip_tailors"
"""

from __future__ import annotations

import sys
from sqlalchemy import create_engine, text


MIGRATION_SQL = """
DO $$
DECLARE
    order_status_values text[];
    has_hold boolean;
    has_old_values boolean;
BEGIN

    -- ── Check current order_status values ──────────────────────────────
    SELECT array_agg(enumlabel) INTO order_status_values
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'order_status';

    has_hold       := 'Hold'    = ANY(order_status_values);
    has_old_values := 'PENDING' = ANY(order_status_values);

    -- ── If already correct, just ensure Hold exists ────────────────────
    IF NOT has_old_values THEN
        IF NOT has_hold THEN
            RAISE NOTICE 'Adding Hold to order_status...';
        ELSE
            RAISE NOTICE 'order_status already correct. Nothing to do.';
        END IF;
    END IF;

END $$;
"""


def run(database_url: str) -> None:
    print(f"Connecting to database...")
    engine = create_engine(database_url, echo=False)

    # ── Check current state ────────────────────────────────────────────
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT t.typname, e.enumlabel "
            "FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid "
            "WHERE t.typname IN ("
            "  'order_status','completion_status','payment_method',"
            "  'material_sale_payment_method','material_sale_status',"
            "  'employee_type','supplier_payment_method','user_role',"
            "  'sms_log_status','sms_campaign_status','sms_template_category'"
            ") ORDER BY t.typname, e.enumsortorder"
        )).fetchall()

    by_type: dict[str, list[str]] = {}
    for typname, label in rows:
        by_type.setdefault(typname, []).append(label)

    order_vals = by_type.get("order_status", [])
    needs_fix  = "PENDING" in order_vals   # old uppercase key names
    has_hold   = "Hold"    in order_vals

    print(f"\nCurrent order_status values: {order_vals}")

    if not needs_fix and has_hold:
        print("\n✅ Database enums are already correct. Hold feature is ready.")
        return

    print("\n🔧 Running enum migration...")

    # ── Build migration SQL ────────────────────────────────────────────
    statements: list[str] = []

    if needs_fix:
        # order_status
        statements += [
            "ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'HOLD' AFTER 'PENDING'",
            "ALTER TYPE order_status RENAME TO order_status_old",
            "CREATE TYPE order_status AS ENUM ('Pending','Hold','In Progress','Completed','Packed','Due','Delivered')",
            """ALTER TABLE orders ALTER COLUMN status TYPE order_status USING (
                CASE status::text
                    WHEN 'PENDING'     THEN 'Pending'::order_status
                    WHEN 'HOLD'        THEN 'Hold'::order_status
                    WHEN 'IN_PROGRESS' THEN 'In Progress'::order_status
                    WHEN 'COMPLETED'   THEN 'Completed'::order_status
                    WHEN 'PACKED'      THEN 'Packed'::order_status
                    WHEN 'DUE'         THEN 'Due'::order_status
                    WHEN 'DELIVERED'   THEN 'Delivered'::order_status
                    ELSE 'Pending'::order_status
                END)""",
            "DROP TYPE order_status_old",

            # completion_status
            "ALTER TYPE completion_status RENAME TO completion_status_old",
            "CREATE TYPE completion_status AS ENUM ('pending','partial','completed')",
            """ALTER TABLE order_items ALTER COLUMN completion_status TYPE completion_status USING (
                CASE completion_status::text
                    WHEN 'PENDING'   THEN 'pending'::completion_status
                    WHEN 'PARTIAL'   THEN 'partial'::completion_status
                    WHEN 'COMPLETED' THEN 'completed'::completion_status
                    ELSE 'pending'::completion_status
                END)""",
            "DROP TYPE completion_status_old",

            # payment_method
            "ALTER TYPE payment_method RENAME TO payment_method_old",
            "CREATE TYPE payment_method AS ENUM ('Cash','Card','Bank Transfer','Cheque')",
            """ALTER TABLE payments ALTER COLUMN method TYPE payment_method USING (
                CASE method::text
                    WHEN 'CASH'          THEN 'Cash'::payment_method
                    WHEN 'CARD'          THEN 'Card'::payment_method
                    WHEN 'BANK_TRANSFER' THEN 'Bank Transfer'::payment_method
                    WHEN 'CHEQUE'        THEN 'Cheque'::payment_method
                    ELSE NULL
                END)""",
            "DROP TYPE payment_method_old",

            # material_sale_payment_method
            "ALTER TYPE material_sale_payment_method RENAME TO material_sale_payment_method_old",
            "CREATE TYPE material_sale_payment_method AS ENUM ('Cash','Card','Bank Transfer','Cheque')",
            """ALTER TABLE material_sales ALTER COLUMN payment_method TYPE material_sale_payment_method USING (
                CASE payment_method::text
                    WHEN 'CASH'          THEN 'Cash'::material_sale_payment_method
                    WHEN 'CARD'          THEN 'Card'::material_sale_payment_method
                    WHEN 'BANK_TRANSFER' THEN 'Bank Transfer'::material_sale_payment_method
                    WHEN 'CHEQUE'        THEN 'Cheque'::material_sale_payment_method
                    ELSE NULL
                END)""",
            "DROP TYPE material_sale_payment_method_old",

            # material_sale_status
            "ALTER TYPE material_sale_status RENAME TO material_sale_status_old",
            "CREATE TYPE material_sale_status AS ENUM ('Paid','Due')",
            """ALTER TABLE material_sales ALTER COLUMN status TYPE material_sale_status USING (
                CASE status::text
                    WHEN 'PAID' THEN 'Paid'::material_sale_status
                    WHEN 'DUE'  THEN 'Due'::material_sale_status
                    ELSE NULL
                END)""",
            "DROP TYPE material_sale_status_old",

            # employee_type
            "ALTER TYPE employee_type RENAME TO employee_type_old",
            "CREATE TYPE employee_type AS ENUM ('CutBase','HourBase','BranchEmployee')",
            """ALTER TABLE employees ALTER COLUMN type TYPE employee_type USING (
                CASE type::text
                    WHEN 'CUT_BASE'        THEN 'CutBase'::employee_type
                    WHEN 'HOUR_BASE'       THEN 'HourBase'::employee_type
                    WHEN 'BranchEmployee'  THEN 'BranchEmployee'::employee_type
                    WHEN 'BRANCH_EMPLOYEE' THEN 'BranchEmployee'::employee_type
                    ELSE 'CutBase'::employee_type
                END)""",
            "DROP TYPE employee_type_old",

            # supplier_payment_method
            "ALTER TYPE supplier_payment_method RENAME TO supplier_payment_method_old",
            "CREATE TYPE supplier_payment_method AS ENUM ('Cheque','Bank Transfer','Money')",
            """ALTER TABLE supplier_payments ALTER COLUMN method TYPE supplier_payment_method USING (
                CASE method::text
                    WHEN 'CHEQUE'        THEN 'Cheque'::supplier_payment_method
                    WHEN 'BANK_TRANSFER' THEN 'Bank Transfer'::supplier_payment_method
                    WHEN 'MONEY'         THEN 'Money'::supplier_payment_method
                    ELSE 'Cheque'::supplier_payment_method
                END)""",
            "DROP TYPE supplier_payment_method_old",

            # user_role
            "ALTER TYPE user_role RENAME TO user_role_old",
            "CREATE TYPE user_role AS ENUM ('master_admin','branch_admin')",
            """ALTER TABLE users ALTER COLUMN role TYPE user_role USING (
                CASE role::text
                    WHEN 'MASTER_ADMIN' THEN 'master_admin'::user_role
                    WHEN 'BRANCH_ADMIN' THEN 'branch_admin'::user_role
                    ELSE 'branch_admin'::user_role
                END)""",
            "DROP TYPE user_role_old",

            # sms_template_category
            "ALTER TYPE sms_template_category RENAME TO sms_template_category_old",
            "CREATE TYPE sms_template_category AS ENUM ('transactional','marketing','festival')",
            """ALTER TABLE sms_templates ALTER COLUMN category TYPE sms_template_category USING (
                CASE category::text
                    WHEN 'TRANSACTIONAL' THEN 'transactional'::sms_template_category
                    WHEN 'MARKETING'     THEN 'marketing'::sms_template_category
                    WHEN 'FESTIVAL'      THEN 'festival'::sms_template_category
                    ELSE 'transactional'::sms_template_category
                END)""",
            "DROP TYPE sms_template_category_old",

            # sms_log_status
            "ALTER TYPE sms_log_status RENAME TO sms_log_status_old",
            "CREATE TYPE sms_log_status AS ENUM ('queued','sending','sent','delivered','failed','skipped','cancelled')",
            """ALTER TABLE sms_logs ALTER COLUMN status TYPE sms_log_status USING (
                CASE status::text
                    WHEN 'QUEUED'    THEN 'queued'::sms_log_status
                    WHEN 'SENDING'   THEN 'sending'::sms_log_status
                    WHEN 'SENT'      THEN 'sent'::sms_log_status
                    WHEN 'DELIVERED' THEN 'delivered'::sms_log_status
                    WHEN 'FAILED'    THEN 'failed'::sms_log_status
                    WHEN 'SKIPPED'   THEN 'skipped'::sms_log_status
                    WHEN 'CANCELLED' THEN 'cancelled'::sms_log_status
                    ELSE 'queued'::sms_log_status
                END)""",
            "DROP TYPE sms_log_status_old",

            # sms_campaign_status
            "ALTER TYPE sms_campaign_status RENAME TO sms_campaign_status_old",
            "CREATE TYPE sms_campaign_status AS ENUM ('draft','scheduled','running','completed','cancelled')",
            """ALTER TABLE sms_campaigns ALTER COLUMN status TYPE sms_campaign_status USING (
                CASE status::text
                    WHEN 'DRAFT'      THEN 'draft'::sms_campaign_status
                    WHEN 'SCHEDULED'  THEN 'scheduled'::sms_campaign_status
                    WHEN 'RUNNING'    THEN 'running'::sms_campaign_status
                    WHEN 'COMPLETED'  THEN 'completed'::sms_campaign_status
                    WHEN 'CANCELLED'  THEN 'cancelled'::sms_campaign_status
                    ELSE 'draft'::sms_campaign_status
                END)""",
            "DROP TYPE sms_campaign_status_old",
        ]

    elif not has_hold:
        # Enums are correct but Hold is missing — just add it
        statements.append(
            "ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'Hold' BEFORE 'In Progress'"
        )

    # ── Execute — ALTER TYPE ADD VALUE must be outside a transaction ───
    # Run ADD VALUE statements with AUTOCOMMIT, rest in a transaction
    add_value_stmts = [s for s in statements if "ADD VALUE" in s]
    other_stmts     = [s for s in statements if "ADD VALUE" not in s]

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for stmt in add_value_stmts:
            print(f"  → {stmt[:60]}...")
            conn.execute(text(stmt))

    if other_stmts:
        with engine.begin() as conn:
            for stmt in other_stmts:
                label = stmt.strip().split("\n")[0][:60]
                print(f"  → {label}...")
                conn.execute(text(stmt))

    print("\n✅ Migration complete!")

    # ── Verify ────────────────────────────────────────────────────────
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT enumlabel FROM pg_enum e "
            "JOIN pg_type t ON t.oid = e.enumtypid "
            "WHERE t.typname = 'order_status' "
            "ORDER BY e.enumsortorder"
        )).fetchall()
    values = [r[0] for r in result]
    print(f"\norder_status values: {values}")

    if "Hold" in values and "Pending" in values:
        print("✅ Hold feature is ready for your client.")
    else:
        print("❌ Something went wrong — check the output above.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nERROR: Please provide the database URL as an argument.")
        print('Example: python backend/scripts/fix_production_enums.py "postgresql+psycopg://user:pass@host:5432/vip_tailors"')
        sys.exit(1)

    run(sys.argv[1])
