# QuickBooks Workspace Wireframe

Paths:
- [client/src/modules/quickbooks/QuickBooksDashboard.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/quickbooks/QuickBooksDashboard.tsx)
- [client/src/modules/quickbooks/QuickBooksRoutes.tsx](/Users/trupal/Projects/RetailSync/client/src/modules/quickbooks/QuickBooksRoutes.tsx)

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

## Money Write Form Sketch

The money editor is a full-page operational form for:
- deposits
- checks
- expenses
- transfers

```text
+---------------------------------------------------------------------------------------------+
| QuickBooks Checks / Deposits / Expenses / Transfers                                         |
|                                                                                             |
| Main Information                                                                            |
| [ Date                         ] [ Amount                         ]                         |
|                                                                                             |
| Money Movement                                                                              |
| [ Bank / Deposit / From Account ] [ Category / To Account        ]                         |
|                                                                                             |
| Payee                                                                                        |
| [ Vendor ]                                                                                  |
|                                                                                             |
| Notes                                                                                        |
| [ Memo                                                                        ]             |
|                                                                                             |
|                                               +-------------------------------------------+ |
|                                               | Review                                    | |
|                                               | Money out of / Deposit to / From account | |
|                                               | Category / To account                    | |
|                                               | Payee                                    | |
|                                               | Amount                                   | |
|                                               +-------------------------------------------+ |
|                                                                                             |
|                                                            [ Cancel ] [ Save / Create ]     |
+---------------------------------------------------------------------------------------------+
```

Usability rules for money writes:
- account selectors should prefer bank-like accounts for bank/from/deposit fields
- category selectors should prefer non-bank accounts and still fall back to all accounts if reference data is sparse
- each selected account should show type/detail context without requiring users to remember QuickBooks IDs
- the save payload should remain the typed QuickBooks contract for `check`, `expense`, `deposit`, and `transfer`

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
