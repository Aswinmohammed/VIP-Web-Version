# Security and Operations

## Secrets

- Keep real values in `.env`, Coolify secrets, or GitHub Environment Secrets.
- Commit only `.env.*.example` templates.
- Rotate `VIP_JWT_SECRET_KEY` if it is ever exposed.
- Use separate SMS API keys for staging and production where possible.

## Production Data Protection

- Never connect local development to production PostgreSQL.
- Do not copy raw production data to developer laptops unless there is a business-approved reason.
- Use sanitized snapshots for local and staging testing.
- Restrict production DB access by network and user permissions.

## GitHub Protection

Recommended branch protection:

- Require pull requests for `main` and `develop`.
- Require passing `VIP Tailors CI/CD` checks.
- Require approval for `main`.
- Protect GitHub `production` environment with manual approval.

## Monitoring

Monitor at minimum:

- `/health` endpoint availability.
- HTTP 5xx error rate.
- Slow API responses.
- Database connection failures.
- Disk usage.
- Backup job failures.
- Failed GitHub Actions deployments.

## Deployment Safety Checklist

Before production deployment:

- Staging has been validated.
- CI is green.
- Production backup exists.
- Required secrets are present in Coolify/GitHub.
- Rollback target is known: previous Git tag or previous Coolify deployment.
