# Ledger Module Wireframe

Path: `/client/src/modules/accounting/pages/LedgerPage.tsx`

The Ledger page is the most mechanically complex grid in the application. It acts as the final "Canonical Review Surface".

## Desktop & Laptop Data Flow Sketch

```text
+------------------------------------------------------------------------------------------+
|  🗂️ Ledger Review                                                                        |
|  Canonical review surface for proposal confidence, evidence, approval, and posting.      |
|                                                                                          |
|  [ Statements Tab ]  [ Ledger Tab ]  [ QuickBooks Tab ]                                  |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | [ Total 142 ] [ Needs Review 5 (I) ] [ Approved 120 ] [ Posted 17 ]                  | |
| |                                 [ Refresh ] [ Bulk Approve (5) ] [ Post Approved ]   | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | [ Review Status ⌵ ] [ Posting ⌵ ] [ Has Check ⌵ ] [ Search...        ] [ Apply ]     | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
|                 +------------------------------------------------------+                 |
|                   +--------------------------------------------------+                   |
|                   | DATE       | DESCRIPTION | AMOUNT  | STATUS      | ACTIONS           |
|                   |------------|-------------|---------|-------------|-------------------|
|                   | 2026-04-12 | Home Depot  | -150.00 | [ Proposed] | [ Approve ]       |
|                   |            | tx_1234b    |         | [ Conf 95% ]| [ Exclude ]       |
|                   |------------|-------------|---------|-------------|-------------------|
|                   | 2026-04-10 | Square Inc  | +420.50 | [ Edited  ] | [ Approve ]       |
|                   |            | Payment RF  |         |             | [ Exclude ]       |
|                   |------------|-------------|---------|-------------|-------------------|
|                   | 2026-04-09 | Shell Gas   |  -45.00 | [ Approved] | [ Post ]          |
|                   |------------|-------------|---------|-------------|-------------------|
|                 +------------------------------------------------------+                 |
+------------------------------------------------------------------------------------------+
```

## Responsive Table Breakpoints (`xs`, `sm`)

On mobile, the complex table header is highly constrained. 

```text
+--------------------------------------+
| 🗂️ Ledger Review                     |
| Canonical review surface...          |
|                                      |
| +----------------------------------+ |
| | [ Total 142 ]                    | |
| | [ Needs Review 5 (I) ]           | |
| | [ Approved 120 ]                 | |
| | [ Posted 17 ]                    | |
| +----------------------------------+ |
|                                      |
| [ Bulk Approve ] [ Post Approved ]   |
|                                      |
| +----------------------------------+ |
| | Review Status ⌵                  | |
| |----------------------------------| |
| | Posting ⌵                        | |
| |----------------------------------| |
| | Has Check ⌵                      | |
| |----------------------------------| |
| | Search...                        | |
| |----------------------------------| |
| | [ Apply ]                        | |
| +----------------------------------+ |
|                                      |
|  <--- Horizontal Scroll Area ---->   |
| +----------------------------------+ |
| | DATE       | DESC   | AMOUNT     | |
| |------------|--------|------------| |
| | 2026-04-12 | HD     | -150.00    | |
| +----------------------------------+ |
|  <------------------------------->   |
+--------------------------------------+
```

**Mobile Architecture Note:** Keep `overflowX: auto` active on the parent wrapper until the table uses a list-card abstraction.
