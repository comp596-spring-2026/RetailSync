# Local Development Runbook

## Prerequisites

- Node 20+
- pnpm 10+
- Docker Desktop (recommended for Mongo)

## Initial Setup

```bash
cd /Users/trupal/Projects/RetailSync
make install
cp /Users/trupal/Projects/RetailSync/server/.env.example /Users/trupal/Projects/RetailSync/server/.env
cp /Users/trupal/Projects/RetailSync/client/.env.example /Users/trupal/Projects/RetailSync/client/.env
```

## Start Development (Non-Docker)

```bash
make dev
```

- Client: `http://localhost:4630`
- Server: `http://localhost:4000`
- Health: `http://localhost:4000/health`
- Client API base env: `VITE_API_URL` in `/client/.env`

`make dev` behavior:

- kills occupied dev ports (`4000`, `4630`, `5173`, `5174`)
- ensures Mongo is available on `27017` (starts `docker compose up -d mongo` if needed)

Optional split mode:

```bash
make dev-server
make dev-client
```

## Start Full Stack (Docker)

```bash
make start
```

- Client: `http://localhost:8080`
- API health: `http://localhost:4000/health`
- MongoDB: `localhost:27017`
- Client build-time API base: Docker `client` build arg `VITE_API_URL` (currently `/api` in `docker-compose.yml`)

## Current Deployment Snapshot

- Production API health: `https://<retailsync-api-url>/health`
- Production API base for client env: `https://<retailsync-api-url>/api`
- Production worker service: `retailsync-worker` (internal Cloud Tasks target)
- Development API service: `retailsync-api-dev`
- Development worker service: `retailsync-worker-dev`

Useful Docker commands:

```bash
make ps
make logs
make stop
```

## Google Integration

For Sheets/service-account and OAuth flows:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_AUTH_REDIRECT_URI`

For QuickBooks OAuth flow:

- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_INTEGRATION_REDIRECT_URI` (local default: `http://localhost:4000/api/integrations/quickbooks/callback`)

For local service-account Sheets tests, authenticate ADC locally:

```bash
gcloud auth application-default login
```

Production Cloud Run uses ADC from attached service account and does not require JSON key env variables.

For accounting task processing:

- local default mode is `TASKS_MODE=inline`
- cloud mode requires `GCP_PROJECT_ID`, `GCP_REGION`, queue names, worker endpoint, and OIDC service account env vars
- worker endpoint is `/api/internal/tasks/run` and is protected by `x-internal-task-secret`
- for observability log shortcuts, set `API_SERVICE_NAME` and `WORKER_SERVICE_NAME`

Local convenience fallback is also supported for Sheets calls:

- `/Users/trupal/Projects/RetailSync/credentials/gcp-service-account-retailsync-run-sa.json`

In non-production mode, if this file exists, the server uses it automatically for Google Sheets API auth.

## Quality and Validation

```bash
make typecheck
make lint
make test
make build
make check
```

For frontend-only verification of the latest UI foundation changes:

```bash
pnpm --filter @retailsync/client lint
pnpm --filter @retailsync/client test
pnpm --filter @retailsync/client build
```

Covered by these checks:

- company onboarding dropdown UX (`CreateCompanyPage`)
- reusable searchable CRUD table + edit/delete dialogs
- shared async feedback flow (loading + toast)
- shared date/table utility tests

## Reset and Cleanup

```bash
make clean
make reset
make reset-hard
```

## Common Issues

1. `EADDRINUSE` on 4000/4630:
- Run `make kill-dev-ports`, then `make dev`.

2. `pnpm install` build scripts blocked:
- Run `make approve-builds` and approve required packages.

3. Docker daemon unavailable:
- Start Docker Desktop and verify `docker info`.

4. OAuth connect returns 401:
- Use connect-url flow and ensure auth/cookie strategy is configured.
