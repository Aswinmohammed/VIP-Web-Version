# VIP Tailors SaaS Backend

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

## Bootstrap the first tenant admin

```bash
python bootstrap_master_admin.py --tenant-code vip --tenant-name "VIP Tailors" --username admin --password ChangeMe123
```

## Environment

Copy `backend/.env.example` to `.env` and set the PostgreSQL connection string and JWT secret.

## Included

- PostgreSQL-ready SQLAlchemy models with tenant and branch scoping
- JWT auth with `tenant_id`, `branch_id`, and `role` claims
- Branch-filtered FastAPI routers
- Server-generated invoice PDF endpoint
- SQL schema and RLS scripts
- Legacy JSON importer at `migrate_legacy_json.py`
- Master admin bootstrap helper at `bootstrap_master_admin.py`
