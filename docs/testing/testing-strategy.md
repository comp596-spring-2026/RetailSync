# Testing Strategy

## Current Implemented Tests

### Server

- `/Users/trupal/Projects/RetailSync/server/src/app.test.ts`
  - verifies health endpoint contract (`/health`)
- `/Users/trupal/Projects/RetailSync/server/src/auth.refresh.test.ts`
  - verifies refresh rotation and old token reuse rejection
- `/Users/trupal/Projects/RetailSync/server/src/tenantIsolation.test.ts`
  - verifies cross-tenant read/write isolation and tenant-scoped aggregates
- `/Users/trupal/Projects/RetailSync/server/src/inventoryLedger.immutability.test.ts`
  - verifies immutable ledger behavior

Run:

```bash
pnpm --filter @retailsync/server test
```

### Client

- `/Users/trupal/Projects/RetailSync/client/src/utils/permissions.test.ts`
  - verifies `hasPermission` behavior for:
    - CRUD checks
    - custom action checks
    - wildcard action checks
- `/Users/trupal/Projects/RetailSync/client/src/components/PermissionGate.test.tsx`
  - verifies module/action-based UI gating behavior

Run:

```bash
pnpm --filter @retailsync/client test
```

## Monorepo Test Command

```bash
pnpm test
```

## Test Pyramid Plan

```mermaid
flowchart TD
  U[Unit Tests\n(permission helpers, mapping, validators)] --> I[Integration Tests\n(express routes + DB behaviors)]
  I --> E[E2E Tests\n(user flows: auth->onboarding->module actions)]
```

## Next High-Priority Tests

1. Onboarding create/join edge cases (expired invite, email mismatch).
2. Permission middleware coverage for all module/action combinations.
3. POS CSV parser validation failures and idempotent upserts.
4. Item/location CRUD negative path tests.
5. End-to-end smoke flows across auth -> onboarding -> inventory.

## Coverage Visibility

Coverage percentages are not currently gated in CI.

- Current CI test gate validates pass/fail only.
- To enforce coverage, add vitest coverage reporting and set minimum thresholds (line/branch/function/statements) per package.

## Suggested Near-Term Tooling Expansion

- Add mongodb-memory-server for route+model integration tests.
- Add Playwright for critical frontend flows.
- Add CI workflow to run `typecheck + test` on pull requests.
