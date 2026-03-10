# Test Plan and Quality Gates (Accounting)

## 1) Test pyramid

1. Unit tests
   - schema validation
   - matching score/reasons
   - quickbooks mapping/fallback logic
2. Integration tests
   - statement pipeline orchestration
   - ledger transition and mirror consistency
   - quickbooks sync job behavior
3. E2E workflow tests
   - upload -> process -> review -> approve -> post
   - failure and retry paths

## 2) Required must-pass scenarios

1. Upload PDF and verify deterministic GCS artifact paths are written.
2. Pipeline runs through extract/structure/check fan-out and updates progress.
3. Invalid structure/check parse keeps statement usable and marks review-needed rows/checks.
4. Matching proposals persist confidence/reasons and mirror to ledger + transaction.
5. Ledger transitions enforce guardrails and bulk operations.
6. Post-approved sends only approved rows and does not duplicate posted rows.
7. QuickBooks token refresh path preserves job continuity.
8. QuickBooks partial failures mark per-entry error without full batch abort.
9. Realtime disconnect falls back to polling without state corruption.
10. Retry of failed check/run is idempotent and avoids duplicate artifacts.

## 3) Module-by-module test ownership

| Module | Primary test focus |
| --- | --- |
| Statements | upload/create/reprocess/retry/check progress behaviors |
| Ledger | filters, transition guards, bulk approve, post trigger |
| QuickBooks Sync | OAuth status, refresh sync, post-approved typed/fallback |
| Observability | summary/debug payloads and readiness actions |
| Worker orchestration | task routing, run records, failure propagation |

## 4) Commands

```bash
# Workspace type safety
pnpm -r typecheck

# Server accounting integration tests
pnpm --filter @retailsync/server exec vitest run src/accounting.e2e.test.ts

# Full server suite
pnpm -C server test

# Full client suite
pnpm -C client test
```

## 5) Release gate checklist

1. All accounting route contracts typecheck against shared schemas.
2. Accounting E2E suite passes in CI.
3. No failed migration dry-run checks before apply.
4. Feature-flag phase can be toggled without orphaning data.
5. Observability summary shows no sustained failed runs in final phase.
