# Testing Strategy

## Current Implemented Tests

### Server

- `/Users/trupal/Projects/RetailSync/server/src/app.test.ts`
  - verifies health endpoint contract (`/health`)

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

1. Auth refresh rotation and logout cookie clearing.
2. Onboarding create/join edge cases (expired invite, email mismatch).
3. Permission middleware coverage for all module/action combinations.
4. POS CSV parser validation failures and idempotent upserts.
5. Inventory move aggregation correctness by location.

## Suggested Near-Term Tooling Expansion

- Add mongodb-memory-server for route+model integration tests.
- Add Playwright for critical frontend flows.
- Add CI workflow to run `typecheck + test` on pull requests.
