# VIP Tailors Production Release Runbook

This runbook is for the fresh production launch where the current production database contains only testing/demo data and can be emptied while preserving schema.

## 1. Pre-Deployment Checklist

Repository and release state:

- `git status --short --branch` reviewed.
- Release branch or `main` contains only intended production changes.
- No local-only patch files, backup files, or demo exports are included in the Docker image.
- `.env`, production secrets, backup dumps, and SSH files are not committed.

Build and test:

- `npm run build` passes.
- `.\.venv\Scripts\python.exe -m pytest backend\tests` passes.
- `.\.venv\Scripts\python.exe -m alembic heads` shows the expected migration head.
- Docker image builds from `deploy/backend.Dockerfile` and `deploy/frontend.Dockerfile`.

Production configuration:

- `VIP_ENVIRONMENT=production`.
- `VIP_DATABASE_URL` points to the production PostgreSQL database only.
- `VIP_JWT_SECRET_KEY` is strong, private, and at least 32 characters.
- `VIP_CORS_ALLOW_ORIGINS` is the exact production frontend origin.
- `VIP_CREATE_TABLES_ON_STARTUP=false` after migrations are applied.
- `VIP_SMS_API_KEY` is configured if SMS should be live.

Database readiness:

- Production backup exists before reset.
- Alembic baseline/migrations are applied.
- Production database target has been positively identified.
- Reset operation has been approved by the business owner.

## 2. Production Database Reset Procedure

The reset preserves schema, constraints, indexes, enum types, triggers, functions, row-level-security policies, and relationships. It empties application tables and resets identities/sequences.

### Dry Run

Run from the project root with the production database URL available as `VIP_DATABASE_URL`:

```powershell
.\.venv\Scripts\python.exe backend\scripts\production_reset_database.py
```

Expected output:

- Database target plan.
- Table list.
- Row counts before reset.
- Dry-run notice.

### Execute Reset

Only after backup verification:

```powershell
.\.venv\Scripts\python.exe backend\scripts\production_reset_database.py --execute --confirm RESET_PRODUCTION_DATABASE
```

The script excludes `alembic_version` by default so migration history remains intact.

### SQL Alternative

The equivalent SQL script is:

```text
database/sql/production_reset_preserve_schema.sql
```

Use the Python script where possible because it includes safer guardrails and before/after counts.

## 3. Verify Clean Initial State

After reset, verify every application table has zero rows except `alembic_version`:

```sql
SELECT schemaname, relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY relname;
```

Application checks:

- No customers.
- No orders.
- No inventory items.
- No invoices/order payments.
- No material sales.
- No SMS campaign/log test data.
- No testing expenses/employees/suppliers.

If the app requires an administrator account, recreate only the real admin:

```powershell
.\.venv\Scripts\python.exe bootstrap_master_admin.py --tenant-code vip --tenant-name "VIP Tailors" --username admin --password "<strong-production-password>"
```

Do not reuse `ChangeMe123` in production.

## 4. Deployment Procedure

1. Confirm CI is green.
2. Confirm production backup exists.
3. Apply migrations if needed:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
```

4. Reset demo/test data if this is the fresh launch.
5. Bootstrap the production admin account.
6. Deploy from Coolify using the production application connected to the intended Git branch/commit.
7. Verify `/health`:

```powershell
Invoke-WebRequest -Uri "https://your-production-domain.com/health" -UseBasicParsing
```

8. Run API smoke test:

```powershell
.\.venv\Scripts\python.exe backend\scripts\smoke_test.py --base-url https://your-production-domain.com --tenant-code vip --username admin --password "<production-password>"
```

## 5. Coolify Backup Configuration

Configure backups on the Coolify PostgreSQL database resource, not only on the application container.

Recommended settings:

- Schedule: daily at 02:00 server time, cron `0 2 * * *`.
- Retention: keep at least last 30 daily backups.
- Weekly retention: keep Sunday backups for at least 8 weeks if Coolify/storage policy supports it.
- Monthly retention: keep first-day-of-month backups for at least 12 months if supported.
- Format: PostgreSQL custom dump format.
- Compression: enabled/custom-format compressed dump where supported.
- Destination: S3-compatible object storage preferred; local server storage is acceptable only as a secondary copy.

Coolify documented PostgreSQL backup command shape:

```bash
pg_dump --format=custom --no-acl --no-owner --username <username> <databaseName>
```

Backup verification:

- After enabling schedule, run `Backup Now`.
- Confirm a backup file appears in the configured destination.
- Restore the backup into a temporary PostgreSQL database/container.
- Run row count and login/API checks against the restored database.

Record these values after configuring Coolify:

| Item | Value |
| --- | --- |
| Backup location | `<fill after Coolify setup>` |
| Daily schedule | `0 2 * * *` |
| Daily retention | `30 backups` |
| Weekly retention | `<fill if supported>` |
| Monthly retention | `<fill if supported>` |
| Last test restore | `<date/time>` |

## 6. Restore Procedure

Estimated restore time depends on database size. For a fresh launch, expect minutes. For future larger datasets, measure during monthly restore drills.

General PostgreSQL restore flow:

1. Stop the production app or put it into maintenance mode.
2. Download/select the intended backup.
3. Create a new empty restore database or clean the target database.
4. Restore custom-format dump:

```bash
pg_restore --verbose --clean -h <host> -U <user> -d <database> <backup-file>.dmp
```

5. Restart backend/frontend services.
6. Verify `/health`, login, dashboard, inventory, orders, material sales, reports, and invoice printing.
7. Review backend logs and database logs.

## 7. Production Validation Checklist

Run after deployment:

- Login works with production admin.
- Dashboard loads.
- Inventory list loads.
- Add inventory item works.
- Barcode generation renders.
- Barcode printing opens/prints correctly from a real workstation/browser.
- Add Order works.
- Order search works.
- Order filters work.
- Material Sales creation works.
- Reports load.
- Invoice printing works.
- `/health` returns `status=ok` and `environment=production`.
- Browser console has no application errors.
- Backend logs have no unhandled errors.
- Database logs have no connection/auth/migration errors.
- Page load/API response times are acceptable for business use.

## 8. Rollback Plan

Code rollback:

- Redeploy the previous known-good Coolify deployment or previous Git tag.
- Keep database schema backward-compatible whenever possible.

Database rollback:

- If reset/deploy causes severe data issues before go-live, restore the pre-reset backup.
- If after go-live real customer data exists, do not truncate; use point-in-time restore or targeted corrective migration.

Emergency checks before rollback:

- Identify whether the issue is frontend, backend, database, DNS/proxy, or secrets.
- Preserve logs and failed deployment ID.
- Do not overwrite the latest backup.

## 9. Go/No-Go Criteria

Go only if:

- Build and tests pass.
- Production env vars are correct.
- Backup Now completed successfully.
- Database reset verified clean.
- Production admin login works.
- Smoke test passes.
- Manual validation checklist passes.
- No critical errors exist in browser/backend/database logs.

No-Go if:

- The release worktree contains unreviewed changes.
- Backup cannot be verified.
- Reset script reports remaining rows after reset.
- Login or critical sales/order/inventory workflows fail.
- Production logs show repeated backend/database errors.
