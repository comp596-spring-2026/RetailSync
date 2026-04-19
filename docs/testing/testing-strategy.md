# Testing Strategy

## Coverage Model

- Unit tests for reducers, hooks, utils, and API wrappers
- Component tests for critical UI and guard behavior
- Integration tests (server) with `mongodb-memory-server`
- E2E module playbook documented in `module-e2e-cases.md`

## Module Coverage (Client)

- Auth: login/onboarding pages + auth API + auth sync flow tests
- POS: slice thunks, mapping wizard, chart rendering tests
- Users: company slice tests
- RBAC: role state tests
- Settings: settings slice + debug helper tests
- Accounting statements: upload/detail/retry coverage plus server pipeline tests
- QuickBooks: hub/page/service coverage across contacts, money, writes, and live reads
- Procurement: hub page smoke test
- Dev: home demo page smoke test

Detailed matrix:

- [Module Test Matrix](/Users/trupal/Projects/RetailSync/docs/testing/module-test-matrix.md)
- [Module E2E Cases](/Users/trupal/Projects/RetailSync/docs/testing/module-e2e-cases.md)
- [Accounting Test Plan](/Users/trupal/Projects/RetailSync/docs/accounting/test-plan.md)

## Server Coverage

- Health/app contract
- JWT refresh rotation and reuse protection
- Company-scoped auth, onboarding, and RBAC behavior
- Statement pipeline, QuickBooks services, and POS/reporting behavior
- POS/reports integration baseline behavior

## Commands

```bash
# Client
pnpm -C client exec tsc --noEmit
pnpm -C client test

# Server
pnpm -C server exec tsc --noEmit
pnpm -C server test

# Workspace
pnpm test
```

## CI

- CI should run client + server typecheck and tests on every PR.
- Integration suites requiring Mongo memory binaries should run in CI environments with download/cache access.
- Full release confidence still requires a runner that permits local bind/listen behavior for `mongodb-memory-server` and `supertest`.
