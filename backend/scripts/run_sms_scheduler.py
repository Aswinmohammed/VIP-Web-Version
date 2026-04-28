from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import SessionLocal
from backend.app.services.sms import queue_due_reminders


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Queue SMS due reminders for overdue orders.")
    parser.add_argument("--tenant-id", default=None)
    parser.add_argument("--branch-id", default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    with SessionLocal.begin() as db:
        queued = queue_due_reminders(db, tenant_id=args.tenant_id, branch_id=args.branch_id)

    print(f"Queued {queued} due reminder SMS log(s).")


if __name__ == "__main__":
    main()
