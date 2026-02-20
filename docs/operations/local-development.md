# Local Development Runbook

## Prerequisites

- Node 20+
- pnpm 10+
- MongoDB running locally (or remote URI)

## Setup

```bash
cd /Users/trupal/Projects/RetailSync
pnpm install
cp /Users/trupal/Projects/RetailSync/server/.env.example /Users/trupal/Projects/RetailSync/server/.env
cp /Users/trupal/Projects/RetailSync/client/.env.example /Users/trupal/Projects/RetailSync/client/.env
```

## Start Services

```bash
pnpm dev
```

- Server on `4000`
- Client on `5173`

## Quality Checks

```bash
pnpm typecheck
pnpm lint
pnpm test
```

## Common Issues

1. `401` loops on client:
- check refresh cookie domain/path and `withCredentials`.

2. CORS errors:
- verify `CLIENT_URL` in server env matches client origin.

3. Empty dashboard modules:
- verify role permissions for module `view`.

4. Onboarding loop:
- ensure `auth/me` returns `company` and `role` after create/join.
