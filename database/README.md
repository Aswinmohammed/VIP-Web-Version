# Database Directory

This directory is reserved for database operations that are not application runtime code.

- `seeds/`: safe seed data for development or staging.
- `backups/`: local-only restore drills or documented backup placeholders. Do not commit real backups.

Alembic migration code lives in `backend/alembic` so it can import backend models cleanly.
