from __future__ import annotations

from sqlalchemy import text

from backend.app.database import engine


def main() -> None:
    statements = [
        """
        ALTER TABLE branches
        ADD COLUMN IF NOT EXISTS access_areas JSON NOT NULL DEFAULT '[]'::json
        """,
        """
        ALTER TABLE branches
        ADD COLUMN IF NOT EXISTS order_actions JSON NOT NULL DEFAULT '[]'::json
        """,
        """
        UPDATE branches
        SET access_areas = '[]'::json
        WHERE access_areas IS NULL
        """,
        """
        UPDATE branches
        SET order_actions = '[]'::json
        WHERE order_actions IS NULL
        """,
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))

    print("Branch access columns are ready.")


if __name__ == "__main__":
    main()
