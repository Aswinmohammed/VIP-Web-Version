# Release and Git Workflow

VIP Tailors should use `develop` for staging and `main` for production.

## Branches

| Branch | Purpose |
| --- | --- |
| main | Production-ready code only |
| develop | Staging integration branch |
| feature/<short-name> | New features |
| fix/<short-name> | Normal bug fixes |
| hotfix/<short-name> | Urgent production fixes from main |
| release/<version> | Optional stabilization branch |

## Feature Flow

```powershell
git checkout develop
git pull origin develop
git checkout -b feature/order-status-filter

# edit, test
git add .
git commit -m "Add order status filter"
git push -u origin feature/order-status-filter
```

Open a pull request from `feature/order-status-filter` to `develop`.

## Staging Flow

1. Merge feature PR into `develop`.
2. GitHub Actions runs tests, frontend build, and Alembic validation.
3. Staging deploy runs from `develop` if `COOLIFY_STAGING_WEBHOOK_URL` is configured.
4. Validate login, orders, customers, inventory, reports, and SMS-related screens on staging.

## Production Flow

1. Open PR from `develop` to `main`.
2. Confirm staging validation is complete.
3. Confirm production backup is available.
4. Merge PR into `main`.
5. GitHub production environment approval gates deployment.
6. Tag the release.

```powershell
git checkout main
git pull origin main
git tag v2026.06.22-1
git push origin v2026.06.22-1
```

## Hotfix Flow

```powershell
git checkout main
git pull origin main
git checkout -b hotfix/login-production-error

# fix, test, commit
git push -u origin hotfix/login-production-error
```

Open PR into `main`, deploy production after approval, then merge `main` back into `develop`.

## Merge Rules

- Squash feature and fix branches into `develop`.
- Require passing CI before merging.
- Require manual approval for production deployment.
- Never commit real `.env` files, customer exports, or database dumps.
