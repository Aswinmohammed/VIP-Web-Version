# Database Workflow

VIP Tailors uses PostgreSQL in all real environments and Alembic for controlled schema changes.

## Database Separation

| Environment | Database |
| --- | --- |
| Local | vip_tailors_dev |
| CI | vip_tailors_test |
| Staging | vip_tailors_staging |
| Production | vip_tailors_prod |

## Alembic Usage

The baseline migration is in `backend/alembic/versions/0001_baseline.py` and initializes an empty PostgreSQL database from the existing SQL files.

Common commands:

```powershell
alembic current
alembic upgrade head
alembic revision --autogenerate -m "describe schema change"
```

After creating a migration:

```powershell
alembic upgrade head
.\.venv\Scripts\python.exe -m pytest backend\tests
npm run build
```

## Migration Rules

- New schema changes should be Alembic migrations.
- Avoid adding new `ALTER TABLE` startup logic in `backend/app/main.py`.
- Prefer backward-compatible migrations: add nullable column, deploy code, backfill, then tighten constraints.
- Do not run experimental migrations against production.

## Backup Rules

Production backups should include:

- Automated daily dump retained for 14-30 days.
- Pre-deploy backup before every production migration.
- Monthly restore drill into a temporary database.
- Encrypted storage and restricted access.

Example production backup command for a controlled server session:

```bash
pg_dump "$VIP_DATABASE_URL" --format=custom --file="vip_tailors_prod_$(date +%Y%m%d_%H%M%S).dump"
```

## Rollback Rules

- Prefer rolling code back to the previous image/tag for application bugs.
- Prefer forward-fix migrations for schema bugs.
- Restore a backup only for severe data incidents.
- The baseline Alembic downgrade is intentionally disabled to avoid accidental destructive drops.
