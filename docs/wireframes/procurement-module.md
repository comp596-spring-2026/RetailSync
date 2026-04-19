# Procurement Module Wireframe

Historical note:
- Procurement is currently hidden from the active product navigation.
- This wireframe is preserved as a planning/reference artifact, not as the current live UX.

Path: `/client/src/modules/procurement/pages/ProcurementHubPage.tsx`

Provides a unified hub for Invoices and Suppliers utilizing a clean Tab structure above generic module data tables.

## Complete Visual Structure (Desktop)

```text
+------------------------------------------------------------------------------------------+
|  🧾 Procurement                                                                          |
|  Manage invoice and supplier workflows together.                                         |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| |  [ Invoices ]  [ Suppliers ]                                              <TAB MENU> | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| |  [+ Create Record (Invoice) ]                    [ Search Invoices... ] [ Filters ⌵ ]| |
| |                                                                                      | |
| |  INVOICE ID | SUPPLIER         | DATE       | STATUS      | AMOUNT    | ACTIONS      | |
| |-------------|------------------|------------|-------------|-----------|--------------| |
| |  INV-0192   | Sysco Foods      | 2026-04-10 | [ Pending ] | $450.00   | [ Edit ]     | |
| |  INV-0193   | PepsiCo          | 2026-04-11 | [ Paid    ] | $120.00   | [ Edit ]     | |
| |                                                                                      | |
| |                              < 1 2 3 ... 9 >                                         | |
| +--------------------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```

## Responsive Layout Rules (Mobile)

On mobile, the tab bar enables swipe-navigation via `variant="scrollable"`. The embedded CRUD table overflows the view width natively.

```text
+--------------------------------------+
| 🧾 Procurement                       |
| Manage invoice and supplier...       |
|                                      |
| +----------------------------------+ |
| | [ Invoices ] [ Suppliers ]   👉  | |
| +----------------------------------+ |
|                                      |
| [+ Create Invoice ]                  |
|                                      |
| +----------------------------------+ |
| | INVOICE | SUPP...  | DATE      > | |
| |---------|----------|-----------  | |
| | INV-019 | Sysco... | 2026...   > | |
| +----------------------------------+ |
+--------------------------------------+
```
