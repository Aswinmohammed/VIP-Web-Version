from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.database import SessionLocal
from backend.app.services.sms import process_sms_queue


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process queued SMS messages.")
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--poll-seconds", type=int, default=0, help="Set to a positive value to keep polling.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    while True:
        with SessionLocal.begin() as db:
            processed = process_sms_queue(db, batch_size=args.batch_size)
        print(f"Processed {processed} queued SMS log(s).")

        if args.poll_seconds <= 0:
            break
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    main()
