from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Iterable

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, make_url

CONFIRMATION_PHRASE = "RESET_PRODUCTION_DATABASE"
SYSTEM_TABLES = {"alembic_version"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Safely empty all application tables while preserving PostgreSQL schema objects."
    )
    parser.add_argument(
        "--database-url",
        default=os.getenv("VIP_DATABASE_URL"),
        help="PostgreSQL SQLAlchemy URL. Defaults to VIP_DATABASE_URL.",
    )
    parser.add_argument(
        "--schema",
        default="public",
        help="Database schema to reset. Defaults to public.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually run TRUNCATE. Without this flag the script only prints the plan.",
    )
    parser.add_argument(
        "--confirm",
        default="",
        help=f"Required confirmation phrase for execution: {CONFIRMATION_PHRASE}",
    )
    parser.add_argument(
        "--include-system-tables",
        action="store_true",
        help="Also truncate system tables such as alembic_version. Not recommended.",
    )
    parser.add_argument(
        "--allow-localhost",
        action="store_true",
        help="Allow localhost database URLs for rehearsal runs.",
    )
    return parser.parse_args()


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def qualified_table(schema: str, table_name: str) -> str:
    return f"{quote_ident(schema)}.{quote_ident(table_name)}"


def guard_database_url(database_url: str, *, allow_localhost: bool) -> None:
    url = make_url(database_url)
    if not url.drivername.startswith("postgresql"):
        raise ValueError("This reset script only supports PostgreSQL database URLs.")

    host = (url.host or "").lower()
    database = (url.database or "").lower()
    if not allow_localhost and host in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Refusing localhost reset without --allow-localhost.")
    if "prod" not in database and "production" not in database:
        print(
            f"Warning: database name '{url.database}' does not look like a production database.",
            file=sys.stderr,
        )


def application_tables(engine: Engine, schema: str, include_system_tables: bool) -> list[str]:
    inspector = inspect(engine)
    table_names = inspector.get_table_names(schema=schema)
    if include_system_tables:
        return sorted(table_names)
    return sorted(table for table in table_names if table not in SYSTEM_TABLES)


def table_counts(engine: Engine, schema: str, tables: Iterable[str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    with engine.connect() as connection:
        for table_name in tables:
            counts[table_name] = int(
                connection.execute(text(f"SELECT COUNT(*) FROM {qualified_table(schema, table_name)}")).scalar_one()
            )
    return counts


def print_counts(title: str, counts: dict[str, int]) -> None:
    print(title)
    for table_name, count in counts.items():
        print(f"  {table_name}: {count}")


def main() -> int:
    args = parse_args()
    if not args.database_url:
        raise SystemExit("VIP_DATABASE_URL or --database-url is required.")

    guard_database_url(args.database_url, allow_localhost=args.allow_localhost)
    engine = create_engine(args.database_url, future=True, pool_pre_ping=True)
    tables = application_tables(engine, args.schema, args.include_system_tables)

    if not tables:
        print(f"No tables found in schema '{args.schema}'.")
        return 0

    table_list_sql = ", ".join(qualified_table(args.schema, table) for table in tables)
    truncate_sql = f"TRUNCATE TABLE {table_list_sql} RESTART IDENTITY CASCADE"

    print("Database reset plan:")
    print(f"  schema: {args.schema}")
    print(f"  table count: {len(tables)}")
    print(f"  excluded system tables: {', '.join(sorted(SYSTEM_TABLES)) if not args.include_system_tables else 'none'}")
    print(f"  SQL: {truncate_sql};")

    before_counts = table_counts(engine, args.schema, tables)
    print_counts("Counts before reset:", before_counts)

    if not args.execute:
        print("Dry run only. Re-run with --execute and the confirmation phrase to reset data.")
        return 0

    if args.confirm != CONFIRMATION_PHRASE:
        raise SystemExit(f"Execution requires --confirm {CONFIRMATION_PHRASE}")

    with engine.begin() as connection:
        connection.execute(text(truncate_sql))

    after_counts = table_counts(engine, args.schema, tables)
    print_counts("Counts after reset:", after_counts)

    dirty_tables = {table: count for table, count in after_counts.items() if count != 0}
    if dirty_tables:
        print_counts("Tables still containing rows:", dirty_tables)
        return 2

    print("Database reset verified: all selected application tables are empty.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
