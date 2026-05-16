# Accounting Statements Wireframe

Last updated: 2026-05-14

Paths:
- [client/src/modules/accounting/pages/StatementsPage.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/accounting/pages/StatementsPage.tsx)
- [client/src/modules/accounting/pages/StatementDetailPage.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/accounting/pages/StatementDetailPage.tsx)

## Current Model

Visible accounting is statements-first:
- statement list
- statement detail month-close workspace
- upload / refresh / reprocess / retry actions
- downstream handoff into ledger review and QuickBooks posting

Ledger, QuickBooks, and observability are no longer the visible accounting tab structure.

## Statements Page Sketch

```text
+---------------------------------------------------------------------------------------------+
| Statements                                                                                  |
| Upload and monitor statement processing.                                                    |
|                                                                                             |
| [ month ] [ status ] [ search ]                                           [Refresh][Upload]|
|                                                                                             |
| [ Queued ] [ Running ] [ Attention ] [ Ready ]                                              |
|                                                                                             |
| +-----------------------------------------------------------------------------------------+ |
| | statement row / card                                                                    | |
| | month | filename | status | stage | checks/progress | updated at | actions             | |
| +-----------------------------------------------------------------------------------------+ |
| | statement row / card                                                                    | |
| +-----------------------------------------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------+
```

## Statement Detail Sketch

```text
+---------------------------------------------------------------------------------------------+
| Statement Detail                                                                            |
| status, month-close, suggestions, artifacts, checks, pipeline visibility                    |
|                                                                                             |
| [Back] [Refresh] [Reprocess] [Open Ledger Review] [Complete Month]                          |
|                                                                                             |
| [Overview] [Suggestions] [Rules] [File Manager]                                             |
|                                                                                             |
| +---------------------------+ +-----------------------------------------------------------+ |
| | statement summary         | | active workspace panel                                     | |
| | status + updated time     | | overview: now/next, entries, month-close gates            | |
| | check progress chips      | | suggestions: approve/exclude + transfer resolution         | |
| | validation + issues       | | rules: soft/hard reuse rules                              | |
| | artifact counts           | | file manager: PDF, OCR, tables, validation artifacts      | |
| +---------------------------+ +-----------------------------------------------------------+ |
|                                                                                             |
| [check card grid / selected check evidence]                                                 |
+---------------------------------------------------------------------------------------------+
```

## UX Rules

- Accounting should not present dead-end tabs.
- Statement list should be the canonical entry point.
- Detail view should support operational retries without forcing users into a separate workspace.
- Statement detail should be the primary review workspace before ledger posting.
- Posting remains a downstream ledger/QuickBooks action, not a primary statement tab.
