# QuickBooks Workspace Wireframe

Paths:
- [client/src/modules/quickbooks/QuickbooksDashboard.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/quickbooks/QuickbooksDashboard.tsx)
- [client/src/modules/quickbooks/QuickbooksRoutes.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/quickbooks/QuickbooksRoutes.tsx)

## Current Model

QuickBooks is a standalone hierarchical workspace:
- hub dashboard first
- quick-access cards by category
- full-page subviews
- back-to-hub navigation on child pages

This workspace is not tab-based anymore.

## Hub Sketch

```text
+---------------------------------------------------------------------------------------------+
| QuickBooks                                                                                  |
| Connected-company operations, reads, writes, and reporting.                                |
|                                                                                             |
| Records                                                                                     |
| [ Accounts ] [ Contacts ]                                                                   |
|                                                                                             |
| Transactions                                                                                |
| [ Sales ] [ Money ]                                                                         |
|                                                                                             |
| Controls                                                                                    |
| [ Operations ] [ Reports ] [ Tax ]                                                         |
|                                                                                             |
| +-----------------------------------------------------------------------------------------+ |
| | Connection panel: status | company | realm id | token health | actions                 | |
| +-----------------------------------------------------------------------------------------+ |
+---------------------------------------------------------------------------------------------+
```

## Child Page Sketch

```text
+---------------------------------------------------------------------------------------------+
| [ Back to QuickBooks ]                                                Current section label |
|                                                                                             |
| <PageHeader />                                                                              |
|                                                                                             |
| section-specific content                                                                    |
| - tables                                                                                    |
| - forms                                                                                     |
| - detail panels                                                                             |
+---------------------------------------------------------------------------------------------+
```

## Information Architecture

- `Accounts`: chart of accounts and account registers
- `Contacts`: customers and vendors
- `Sales`: invoices and payments
- `Money`: deposits, checks, expenses, transfers
- `Operations`: posting status and sync outcomes
- `Reports`: reporting views
- `Tax`: tax-support workflows

## UX Rules

- No top tab strip across the whole workspace.
- Hub cards are the main entry point.
- Child pages should feel like dedicated operational surfaces, not nested panels inside the hub.
