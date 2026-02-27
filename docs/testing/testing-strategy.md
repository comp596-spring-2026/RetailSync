# Testing Strategy

## Current Implemented Tests

### Server

- `/Users/trupal/Projects/RetailSync/server/src/app.test.ts`
  - health endpoint contract
- `/Users/trupal/Projects/RetailSync/server/src/auth.refresh.test.ts`
  - refresh rotation and old token reuse rejection
- `/Users/trupal/Projects/RetailSync/server/src/tenantIsolation.test.ts`
  - cross-tenant isolation + scoped aggregates
- `/Users/trupal/Projects/RetailSync/server/src/inventoryLedger.immutability.test.ts`
  - immutable ledger behavior
- `/Users/trupal/Projects/RetailSync/server/src/posAndReports.test.ts`
  - POS daily returns empty array when no data; reports monthly summary returns zeroed totals when no data

### Client

- `/Users/trupal/Projects/RetailSync/client/src/utils/permissions.test.ts`
- `/Users/trupal/Projects/RetailSync/client/src/components/PermissionGate.test.tsx`
- `/Users/trupal/Projects/RetailSync/client/src/components/ImportPOSDataModal.test.tsx`

## Run Commands

```bash
pnpm --filter @retailsync/server test
pnpm --filter @retailsync/client test
pnpm test
```

## Test Pyramid

```mermaid
flowchart TD
  U["Unit\nutilities, schemas"] --> I["Integration\nexpress + DB behavior"]
  I --> F["Flow/E2E\ntenant workflows"]
```

## CI Notes

- **Unit** (`pnpm --filter @retailsync/server test:unit`): Excludes DB-backed tests (tenant isolation, auth refresh, inventory ledger, posAndReports). No MongoDB required.
- **Integration** (`pnpm --filter @retailsync/server test:integration`): Runs tests that use `mongodb-memory-server` (tenant isolation, auth refresh, inventory ledger immutability, POS/reports empty-state). Requires runtime that can start MongoMemoryServer (e.g. write to cache for binary download).
- Use targeted unit test commands when DB tests are unavailable.

## Next Priority

1. Add E2E browser automation (Playwright) for complete login/onboarding/dashboard flows.
2. Add coverage thresholds in CI.
