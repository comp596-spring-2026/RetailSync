# App Shell Wireframe

Path: [client/src/app/layout/DashboardLayout.tsx](/Users/trupal/Projects/RetailSync/client/src/app/layout/DashboardLayout.tsx)

## Current Navigation Model

Visible navigation:
- Dashboard
- POS
- Accounting
- QuickBooks
- Settings
- Access

The shell is responsive:
- permanent drawer on desktop
- temporary drawer on mobile
- top app bar with company name and profile menu

## Desktop Sketch

```text
+--------------------------------------------------------------------------------------------------+
| [RetailSync logo] [Company Name....................]                           [User Name v]     |
+--------------------------------------+-----------------------------------------------------------+
| Dashboard                            |                                                           |
| POS                                  |  <PageHeader />                                           |
| Accounting                           |                                                           |
| QuickBooks                           |  active workspace content                                 |
| Settings                             |                                                           |
|                                      |  cards / tables / forms / empty states                    |
| Access                               |                                                           |
|                                      |                                                           |
+--------------------------------------+-----------------------------------------------------------+
```

## Mobile Sketch

```text
+--------------------------------------+
| [☰] [Logo] [Company]       [User v]  |
+--------------------------------------+
|                                      |
| active workspace content             |
|                                      |
| cards stack vertically               |
| tables use contained scroll areas    |
|                                      |
+--------------------------------------+
```

## UX Rules

- Shell width is fixed at `260px` for desktop drawer.
- Company name truncates instead of wrapping.
- Workspace pages should own their main content; the shell should not introduce nested tabs for unrelated modules.
- QuickBooks and Accounting are separate top-level concerns.
