# Local Development Runbook

## Prerequisites

- Node 20+
- pnpm 10+
- Docker Desktop (optional, for containerized run)

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

- Server: `http://localhost:4000`
- Client: `http://localhost:5173`

Optional split mode:

```bash
make dev-server
make dev-client
```

## Start Development (Docker)

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

## Quality and Validation

```bash
make typecheck
make lint
make test
make build
make check
```

`make check` mirrors the local CI gate sequence.

## Reset and Cleanup

```bash
# remove build artifacts
make clean

# stop docker + remove docker volumes + clean artifacts
make reset

# full clean including node_modules and local pnpm store
make reset-hard
```

## Common Issues

1. `pnpm install` build scripts are blocked:
- Run `make approve-builds` and approve required packages.

2. `ENOTFOUND registry.npmjs.org`:
- Network/DNS issue in local environment; retry after connectivity is restored.

3. Docker cannot connect to daemon:
- Start Docker Desktop and verify `docker info`.

4. Auth cookie/401 loop in browser:
- Validate `CLIENT_URL`, CORS, and `withCredentials` behavior.
