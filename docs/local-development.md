# Local Development Setup

This guide runs VIP Tailors locally without touching production.

## 1. Clone and Install

```powershell
git clone <your-github-repo-url>
cd "D:\VIP Web Version"

npm ci

python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

## 2. Start a Local PostgreSQL Database

Option A: database only, then run frontend/backend directly:

```powershell
docker run --name vip-postgres-dev `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=vip_tailors_dev `
  -p 5432:5432 `
  -d postgres:16
```

Option B: full local Docker stack:

```powershell
docker compose -f deploy\docker-compose.dev.yml up --build
```

The full stack exposes:

- Frontend: http://localhost:8080
- Backend: http://localhost:8000
- Database: localhost:5432

## 3. Configure Local Environment

Copy the safe template:

```powershell
Copy-Item .env.development.example .env
```

Expected local values:

```env
VIP_ENVIRONMENT=development
VIP_DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/vip_tailors_dev
VIP_JWT_SECRET_KEY=local-dev-secret-change-me-32-characters
VIP_CREATE_TABLES_ON_STARTUP=true
VIP_CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

## 4. Run the App Directly

Terminal 1, backend:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Terminal 2, frontend:

```powershell
npm run dev
```

Open http://localhost:3000.

## 5. Initialize Schema and Admin User

For fresh local databases, keep `VIP_CREATE_TABLES_ON_STARTUP=true` or run Alembic:

```powershell
.\.venv\Scripts\Activate.ps1
alembic upgrade head
```

Bootstrap a local admin:

```powershell
.\.venv\Scripts\python.exe bootstrap_master_admin.py --tenant-code vip --tenant-name "VIP Tailors Dev" --username admin --password ChangeMe123
```

## 6. Validate Before Pushing

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests
npm run build
```

Only push after both commands pass.
