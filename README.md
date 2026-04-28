# VIP Tailors

VIP Tailors is a multi-branch tailoring ERP built for order management, customers, employees, inventory, reporting, and SMS operations.

## Tech Stack

- Frontend: React 18, TypeScript, Vite
- Backend: FastAPI, SQLAlchemy
- Database: PostgreSQL
- Authentication: JWT access and refresh tokens

## Current Architecture

This project uses a hosted web architecture:

1. Frontend app in the project root
2. FastAPI backend in [backend/app](/D:/VIP%20Web%20Version/backend/app:1)
3. PostgreSQL database

## Recommended Architecture For Coolify

Use a two-service application behind one public domain:

- `frontend`: Nginx serves the built Vite app
- `backend`: FastAPI serves `/api/*`
- `database`: PostgreSQL managed by Coolify

Recommended request flow:

```text
Browser
  -> Frontend container (Nginx)
  -> /api/* proxied to Backend container (FastAPI)
  -> Backend reads/writes PostgreSQL
```

This architecture fits your codebase well because the frontend already uses same-origin API paths like `/api/v1` and `/api/save-pdf`.

## What Changed For Coolify

The repository now includes deployment files for a container-based setup:

- [docker-compose.coolify.yml](/D:/VIP%20Web%20Version/docker-compose.coolify.yml:1)
- [deploy/backend.Dockerfile](/D:/VIP%20Web%20Version/deploy/backend.Dockerfile:1)
- [deploy/frontend.Dockerfile](/D:/VIP%20Web%20Version/deploy/frontend.Dockerfile:1)
- [deploy/nginx.conf](/D:/VIP%20Web%20Version/deploy/nginx.conf:1)
- [.dockerignore](/D:/VIP%20Web%20Version/.dockerignore:1)

These files let you deploy the app in Coolify as a Docker Compose application with a reverse proxy-friendly layout.

## Do You Need To Change The Architecture?

Yes, but only at the deployment layer, not with a full app rewrite.

Recommended changes:

- Keep the React frontend and FastAPI backend separated as services
- Use PostgreSQL only for hosted deployment
- Put the frontend behind Nginx so `/api` can proxy to the backend on the internal Coolify network
- Use Coolify-managed environment variables instead of local `.env` files in production

Not recommended for Coolify:

- Exposing frontend and backend on unrelated public domains unless you also redesign CORS and API base URLs

## Project Structure

```text
.
|-- App.tsx
|-- components/
|-- context/
|-- hooks/
|-- utils/
|-- backend/
|   |-- app/
|   |   |-- api/
|   |   |-- core/
|   |   |-- services/
|   |   |-- main.py
|   |-- requirements.txt
|   |-- scripts/
|   |-- tests/
|-- deploy/
|   |-- backend.Dockerfile
|   |-- frontend.Dockerfile
|   |-- nginx.conf
|-- docker-compose.coolify.yml
```

## Environment Variables

Use Coolify environment variables for production.

Local file convention:

- `.env` contains your real local development values
- `.env.example` is the safe template for new setups
- production values should be set in Coolify, not committed as files

Required backend variables:

- `VIP_ENVIRONMENT=production`
- `VIP_DATABASE_URL`
- `VIP_JWT_SECRET_KEY`
- `VIP_CORS_ALLOW_ORIGINS`

Common optional variables:

- `VIP_SMS_API_KEY`
- `VIP_ACCESS_TOKEN_EXPIRES_MINUTES`
- `VIP_REFRESH_TOKEN_EXPIRES_DAYS`
- `VIP_CREATE_TABLES_ON_STARTUP`

Example production values:

```env
VIP_ENVIRONMENT=production
VIP_DATABASE_URL=postgresql+psycopg://vip_tailors:strong-password@db-host:5432/vip_tailors
VIP_JWT_SECRET_KEY=replace-with-a-long-random-secret-at-least-32-characters
VIP_CORS_ALLOW_ORIGINS=https://your-domain.example.com
VIP_ACCESS_TOKEN_EXPIRES_MINUTES=60
VIP_REFRESH_TOKEN_EXPIRES_DAYS=7
VIP_CREATE_TABLES_ON_STARTUP=false
VIP_SMS_API_KEY=replace-with-your-intech-sms-api-key
```

Important production rules already enforced by the backend:

- weak default JWT secrets are rejected in production
- `localhost` database URLs are rejected in production
- at least one allowed CORS origin must be configured in production

## Local Development

Frontend:

```bash
npm install
npm run dev
```

Backend:

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

The Vite dev server proxies `/api` to `http://127.0.0.1:8000`.

## Coolify Deployment

### Option 1: Recommended

Create one Docker Compose application in Coolify using [docker-compose.coolify.yml](/D:/VIP%20Web%20Version/docker-compose.coolify.yml:1).

Steps:

1. Push this project to your git repository.
2. In Coolify, create a new Docker Compose application.
3. Point it to this repository.
4. Set the compose file path to `docker-compose.coolify.yml`.
5. Create or attach a PostgreSQL database in Coolify.
6. Replace `VIP_DATABASE_URL` with the real database connection string.
7. Set `VIP_JWT_SECRET_KEY` to a strong secret.
8. Set `VIP_CORS_ALLOW_ORIGINS` to your real domain.
9. Deploy.

Environment variables to add in Coolify:

```env
VIP_ENVIRONMENT=production
VIP_DATABASE_URL=postgresql+psycopg://vip_tailors:strong-password@db-host:5432/vip_tailors
VIP_JWT_SECRET_KEY=replace-with-a-random-secret-at-least-32-characters-long
VIP_CORS_ALLOW_ORIGINS=https://your-domain.example.com
VIP_ACCESS_TOKEN_EXPIRES_MINUTES=60
VIP_REFRESH_TOKEN_EXPIRES_DAYS=7
VIP_CREATE_TABLES_ON_STARTUP=false
VIP_SMS_API_KEY=replace-with-your-intech-sms-api-key
```

Domain setup:

- Assign your public domain only to the `frontend` service
- Leave the `backend` service without a public domain
- The frontend container will proxy `/api/*` requests to the backend internally

### Option 2: Separate Services

If you prefer separate Coolify services instead of one compose app:

- frontend Dockerfile: `deploy/frontend.Dockerfile`
- backend Dockerfile: `deploy/backend.Dockerfile`

If you use this path, keep both services on the same internal network and make sure the frontend Nginx config can reach the backend service by service name.

## Database Bootstrap

After the backend is connected to PostgreSQL, run the bootstrap scripts once:

```bash
python backend/scripts/bootstrap_hosting.py
python bootstrap_master_admin.py --tenant-code vip --tenant-name "VIP Tailors" --username admin --password "change-this-now" --create-schema
```

In production, run those commands inside the backend container or from a trusted admin shell with the same production environment variables loaded.

## Verification

Frontend build:

```bash
npm run build
```

Backend tests:

```bash
python -m pytest backend/tests -q
```

Hosted smoke test:

```bash
python backend/scripts/smoke_test.py --base-url https://your-domain.example.com --tenant-code vip --username admin --password "your-password"
```

## Architecture Notes

- [backend/app/main.py](/D:/VIP%20Web%20Version/backend/app/main.py:1) is the production API entrypoint
- The frontend already assumes same-origin API routing, which is why the Nginx reverse proxy pattern is the cleanest Coolify fit
- A future cleanup would be to move the frontend files into a dedicated `frontend/` directory, but it is not required for deployment
