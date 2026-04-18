# Settings Module Wireframe

Path: `/client/src/modules/settings/pages/SettingsPage.tsx`

Applies an Accordion-styled approach to organize high-density integration panels.

## UI Blueprint Sketch (Desktop)

```text
+------------------------------------------------------------------------------------------+
|  ⚙ Settings                                                                              |
|  Manage Google Sheets and QuickBooks integration configuration                             |
|                                                                                          |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | ⌵ Integrations                                                                       | |
| |   Expand to configure Google Sheets and QuickBooks.                                  | |
| |                                                                                      | |
| |   +------------------------------------------------------------------------------+   | |
| |   | 🟢 Google Sheets Integration                                  [ (G) Reset ]    |   | |
| |   | Pull data manually or on a schedule from connected sources.                    |   | |
| |   |                                                                                |   | |
| |   | Sync Schedule:   ( ) Daily   ( ) Weekly   ( ) Manual                           |   | |
| |   |                                                                                |   | |
| |   | Connected Sheets:                                                              |   | |
| |   | 📄 POS-DATA-2026                                              [ Debug ]        |   | |
| |   |                                                                                |   | |
| |   | [ Add new sheet source ]                                                       |   | |
| |   +------------------------------------------------------------------------------+   | |
| |                                                                                      | |
| |   +------------------------------------------------------------------------------+   | |
| |   | 🔴 QuickBooks Online                                          [ Connect  ]     |   | |
| |   | Push ledger entries and statements securely to Intuit.                         |   | |
| |   +------------------------------------------------------------------------------+   | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
+------------------------------------------------------------------------------------------+
```

## Debug Dialog Execution Window

When a user clicks "Debug" on a Google Sheet, a modal appears above the content:

```text
+--------------------------------------------------+
| Debug: Shared Sheet                          [X] |
+--------------------------------------------------+
|                                                  |
|  (✓) Resolve shared sheet profile                |
|  (✓) Verify sheet access                         |
|  (⏳) Fetching tabs...                           |
|       [+] Show Logs                              |
|           > Searching spreadsheet ID: 19fkd...   |
|           > Success. Tab: 'Sheet1'               |
|                                                  |
|  ( ) Read preview rows                           |
|  ( ) Validate mapped fields                      |
|                                                  |
+--------------------------------------------------+
|                                        [ Close ] |
+--------------------------------------------------+
```
