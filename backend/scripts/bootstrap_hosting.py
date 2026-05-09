from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import engine
from backend.app.main import ensure_branch_access_columns, ensure_employee_salary_columns, ensure_order_status_support, settings
from backend.app.models import Base


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Bootstrap the hosted FastAPI database schema.")
    parser.add_argument(
        "--skip-create-schema",
        action="store_true",
        help="Skip SQLAlchemy create_all and only run compatibility patching.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    print(f"Bootstrapping database for environment={settings.environment!r}")
    if not args.skip_create_schema:
        Base.metadata.create_all(bind=engine)
        print("Created any missing tables from SQLAlchemy metadata.")

    ensure_branch_access_columns()
    ensure_employee_salary_columns()
    ensure_order_status_support()
    print("Applied compatibility bootstrap for branch, employee, and order status schema updates.")
    print("Next step: create a master admin with bootstrap_master_admin.py if needed.")


if __name__ == "__main__":
    main()
