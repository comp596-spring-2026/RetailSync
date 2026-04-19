# Accounting Documentation

Last updated: 2026-04-17

## Current Product Model

The visible accounting workspace is statements-first.

User-facing accounting routes:
- `/dashboard/accounting/statements`
- `/dashboard/accounting/statements/:statementId`

QuickBooks is documented separately as its own workspace. Shared backend data and sync services still interact with accounting records, but client-side QuickBooks workspace ownership now lives under the dedicated QuickBooks module.

## What Accounting Owns

- statement upload
- statement processing lifecycle
- statement detail and artifact inspection
- retry and reprocess actions

## What Accounting No Longer Owns In The Visible UI

- QuickBooks tab navigation
- tax as a primary accounting tab
- observability as a primary accounting tab
- ledger as a visible user workspace tab

Some related backend endpoints still exist for operational compatibility, but they are not the intended top-level UI model.

## Related Docs

- statements and lifecycle docs in this folder
- QuickBooks UX and routing docs under [docs/wireframes/quickbooks-module.md](/Users/trupal/Projects/RetailSync/docs/wireframes/quickbooks-module.md)
- product status in [docs/status.md](/Users/trupal/Projects/RetailSync/docs/status.md)
