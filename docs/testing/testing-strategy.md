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

- Some suites require `mongodb-memory-server` runtime support.
- Environments that block ephemeral bind/listen operations can fail DB-backed tests.
- Use targeted unit test commands for transport/template verification when DB tests are unavailable.

## Next Priority

1. Add E2E browser automation (Playwright) for complete login/onboarding/dashboard flows.
2. Add coverage thresholds in CI.
