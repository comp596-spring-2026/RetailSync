# Dashboard Home Wireframe

Path: `/client/src/app/pages/DashboardHomePage.tsx`

This page is the landing zone for users mapping their context (User, Company, Role).

## Visual Sketch (Desktop & Laptop)

```text
+------------------------------------------------------------------------------------------+
|  ❖ Dashboard                                                                             |
|  Your current account context                                                            |
|                                                                                          |
| +-------------------------+ +-------------------------+ +------------------------------+ |
| | 👤 User                 | | 🏢 Company              | | 🏷️ Role                      | |
| |                         | |                         | |                              | |
| | John Doe                | | ACME Corp               | |  [ Admin ]                   | |
| +-------------------------+ +-------------------------+ +------------------------------+ |
|                                                                                          |
+------------------------------------------------------------------------------------------+
```

## Visual Sketch (Mobile)

On mobile, the `<Grid2>` breaks the 3-column span to a simple 1-column stack.

```text
+--------------------------------------+
| ❖ Dashboard                          |
| Your current account context         |
|                                      |
| +----------------------------------+ |
| | 👤 User                          | |
| |                                  | |
| | John Doe                         | |
| +----------------------------------+ |
|                                      |
| +----------------------------------+ |
| | 🏢 Company                       | |
| |                                  | |
| | ACME Corp                        | |
| +----------------------------------+ |
|                                      |
| +----------------------------------+ |
| | 🏷️ Role                          | |
| |                                  | |
| |  [ Admin ]                       | |
| +----------------------------------+ |
+--------------------------------------+
```
