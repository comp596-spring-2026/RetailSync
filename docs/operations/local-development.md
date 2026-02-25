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

Useful Docker commands:

```bash
make ps
make logs
make stop
```

## Email Integration (Resend)

Required for real OTP delivery:

- `RESEND_API_KEY`
- `RESEND_FROM`

Development note:

- If your Resend account is in testing mode, you can only send to your own verified inbox.
- API returns `emailDebug` in non-production when delivery fails.

## Google Integration

For Sheets/service-account and OAuth flows:

- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_AUTH_REDIRECT_URI`

## Quality and Validation

```bash
make typecheck
make lint
make test
make build
make check
```

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

4. Email API returns 403 validation error:
- Verify Resend domain/sender policy and `RESEND_FROM` value.

5. OAuth connect returns 401:
- Use connect-url flow and ensure auth/cookie strategy is configured.
