# Accounting Statements Wireframe

Paths:
- [client/src/modules/accounting/pages/StatementsPage.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/accounting/pages/StatementsPage.tsx)
- [client/src/modules/accounting/pages/StatementDetailPage.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/accounting/pages/StatementDetailPage.tsx)

## Current Model

Visible accounting is statements-first:
- statement list
- statement detail
- upload / refresh / reprocess / retry actions

Ledger, QuickBooks, and observability are no longer the visible accounting tab structure.

## Statements Page Sketch

```text
+---------------------------------------------------------------------------------------------+
| Statements                                                                                  |
| Upload and monitor statement processing.                                                    |
|                                                                                             |
| [ filters ] [ search ]                                                     [Refresh][Upload]|
|                                                                                             |
| [ Active ] [ Ready ] [ Failed ]                                                             |
|                                                                                             |
| +-----------------------------------------------------------------------------------------+ |
| | statement row / card                                                                    | |
| | month | filename | status | updated at | actions                                        | |
| +-----------------------------------------------------------------------------------------+ |
| | statement row / card                                                                    | |
| +-----------------------------------------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------+
```

## Statement Detail Sketch

```text
+---------------------------------------------------------------------------------------------+
| Statement Detail                                                                            |
| status, month, artifacts, checks, pipeline visibility                                       |
|                                                                                             |
| [Back] [Refresh] [Reprocess]                                                                |
|                                                                                             |
| +---------------------------+ +-----------------------------------------------------------+ |
| | statement metadata        | | check/review area                                          | |
| | upload status             | | retry states                                               | |
| | artifact access           | | processing details                                         | |
| +---------------------------+ +-----------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------+
```

## UX Rules

- Accounting should not present dead-end tabs.
- Statement list should be the canonical entry point.
- Detail view should support operational retries without forcing users into a separate workspace.
