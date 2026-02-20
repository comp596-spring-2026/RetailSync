# RetailSync

Multi-tenant SaaS starter for retail operations, built as a pnpm monorepo:

- `client`: Vite + React + TypeScript + MUI + Redux Toolkit
- `server`: Express + TypeScript + MongoDB + Mongoose + Zod + JWT
- `shared`: shared types, enums, and Zod schemas

Current state:
- Foundation complete: auth, onboarding, multi-tenant scoping, RBAC shell
- Milestone 1 complete: POS CSV import + monthly reports
- Milestone 2 complete: items, locations, inventory ledger move + location stock aggregation

## Documentation Map

- `/Users/trupal/Projects/RetailSync/docs/architecture/system-overview.md`
- `/Users/trupal/Projects/RetailSync/docs/architecture/data-model.md`
- `/Users/trupal/Projects/RetailSync/docs/backend/api-reference.md`
- `/Users/trupal/Projects/RetailSync/docs/backend/rbac-and-security.md`
- `/Users/trupal/Projects/RetailSync/docs/frontend/client-architecture.md`
- `/Users/trupal/Projects/RetailSync/docs/frontend/routing-and-permission-gates.md`
- `/Users/trupal/Projects/RetailSync/docs/operations/local-development.md`
- `/Users/trupal/Projects/RetailSync/docs/operations/seeding-and-sample-data.md`
- `/Users/trupal/Projects/RetailSync/docs/operations/ci-cd-pipeline.md`
- `/Users/trupal/Projects/RetailSync/docs/testing/testing-strategy.md`
- `/Users/trupal/Projects/RetailSync/docs/roadmap/milestones.md`

## Monorepo Structure

```text
RetailSync/
  client/
  server/
  shared/
  docs/
```

## Quick Start

1. Install dependencies:

```bash
cd /Users/trupal/Projects/RetailSync
pnpm install
```

2. Configure environment files:

`/Users/trupal/Projects/RetailSync/server/.env`

```dotenv
PORT=4000
MONGO_URI=mongodb://127.0.0.1:27017/retailsync
JWT_ACCESS_SECRET=replace-with-strong-secret
JWT_REFRESH_SECRET=replace-with-strong-secret
CLIENT_URL=http://localhost:5173
NODE_ENV=development
```

`/Users/trupal/Projects/RetailSync/client/.env`

```dotenv
VITE_API_URL=http://localhost:4000/api
```

3. Run both apps:

```bash
pnpm dev
```

4. Open:
- Client: `http://localhost:5173`
- Server health: `http://localhost:4000/health`

## Core Commands

```bash
# quality
pnpm typecheck
pnpm lint
pnpm test

# single-package checks
pnpm --filter @retailsync/server typecheck
pnpm --filter @retailsync/client typecheck
pnpm --filter @retailsync/server test
pnpm --filter @retailsync/client test
```

## Security Model

- Access token: 15m JWT, sent as `Authorization: Bearer`
- Refresh token: 7d JWT, sent as `HttpOnly` cookie (`SameSite=Lax`)
- API always enforces auth and role permissions server-side
- Client also enforces UX gating (`PermissionGate`, sidebar visibility)
- Every business query is company-scoped via `req.companyId`

## Multi-Tenant Model

- Users can register before company assignment
- Onboarding supports:
  - create company
  - join company with `companyCode + inviteCode + email`
- After onboarding, user receives `companyId` + `roleId`
- Controllers filter records by `companyId` for all tenant data

## Testing Status

Tests are implemented and runnable now:

- `/Users/trupal/Projects/RetailSync/server/src/app.test.ts`
  - verifies `/health` endpoint behavior
- `/Users/trupal/Projects/RetailSync/server/src/auth.refresh.test.ts`
  - verifies refresh rotation behavior and token reuse rejection
- `/Users/trupal/Projects/RetailSync/server/src/tenantIsolation.test.ts`
  - verifies tenant isolation for reads/writes and aggregate scoping
- `/Users/trupal/Projects/RetailSync/server/src/inventoryLedger.immutability.test.ts`
  - verifies immutable ledger constraints
- `/Users/trupal/Projects/RetailSync/client/src/utils/permissions.test.ts`
  - verifies RBAC action checks for CRUD + custom actions + wildcard
- `/Users/trupal/Projects/RetailSync/client/src/components/PermissionGate.test.tsx`
  - verifies UI gating by module/action permission

Current gap:
- Coverage thresholds are not yet enforced in CI (test pass/fail is enforced today).

See `/Users/trupal/Projects/RetailSync/docs/testing/testing-strategy.md` for full test plan and next test targets.

## Current Feature Surface

Implemented modules:
- auth/register/login/refresh/logout/me
- onboarding/company create+join
- roles and permissions
- users and invites
- pos import + daily query + monthly summary
- items CRUD + CSV import
- locations CRUD
- inventory move + stock by location

Module shells still placeholder:
- invoices OCR flow (next)
- bank statement parsing and reconciliation (next)
- advanced reporting and audit exports (next)

## Roadmap Snapshot

- Milestone 3: invoice upload + OCR parsing stub + confirm to purchase ledger
- Milestone 4: bank statement upload + auto-match suggestions + payment allocation

Detailed roadmap: `/Users/trupal/Projects/RetailSync/docs/roadmap/milestones.md`

## Production Docker

### Files

- `/Users/trupal/Projects/RetailSync/.dockerignore`
- `/Users/trupal/Projects/RetailSync/server/Dockerfile`
- `/Users/trupal/Projects/RetailSync/client/Dockerfile`
- `/Users/trupal/Projects/RetailSync/client/nginx.conf`
- `/Users/trupal/Projects/RetailSync/docker-compose.yml`

### Run Full Stack with Docker Compose

```bash
docker compose up --build -d
```

Endpoints:

- App: `http://localhost:8080`
- API health: `http://localhost:4000/health`
- MongoDB: `localhost:27017`

Stop:

```bash
docker compose down
```

Stop + remove db volume:

```bash
docker compose down -v
```

### Production Validation Commands

Run all checks locally:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Run checks in Dockerized server/client containers (after `docker compose up`):

```bash
docker compose exec server node -v
docker compose exec client nginx -v
```

## Current Environment Note

If you see `ENOTFOUND registry.npmjs.org` during `pnpm install`, the environment has no npm registry access. In that case, dependency install, local build, and tests cannot execute until network access is restored.
