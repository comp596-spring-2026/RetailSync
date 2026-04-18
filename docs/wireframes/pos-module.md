# Point of Sale (POS) Module Wireframe

Path: `/client/src/modules/pos/pages/PosPage.tsx`

The POS hub utilizes a universal control panel governing three distinct sub-views: Table, Analytics, and AI.

## Layout Sketch (Analytics Sub-View)

```text
+------------------------------------------------------------------------------------------+
|  📊 POS Analytics View                                               [ FROM ▼ ] [ TO ▼ ] |
|  Analyze sales trends, distribution, and patterns.                   [Table][Anal][AI]   |
|                                                                      [ (G) Sync Now ]    |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| |  KPI Strip                                                                           | |
| |  [ Total ]  [ Net Inc ]  [ Credit ]  [ Cash ]  [ Gas ]  [ Lottery ]  [ Tax ]         | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
| +----------------------------------------+ +-------------------------------------------+ |
| |  Sales Trends (Line Chart)             | |  Tender Distribution (Pie Chart)          | |
| |                                        | |                                           | |
| |       _.-~-._                          | |             ,-***-,                       | |
| |     ,/       \                         | |           /         \                     | |
| |    /          `-_                      | |          |           |                    | |
| |  ,-              `-.                   | |           \         /                     | |
| | /                   \                  | |             `-***-'                       | |
| +----------------------------------------+ +-------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```

## Sub-View Wireframes (Table & AI)

### Table View (`PosTableViewPage`)
Filters explicitly change from charts to a paginated Data Table.

```text
+------------------------------------------------------------------------------------------+
|  📟 POS Table View                                                   [ FROM ▼ ] [ TO ▼ ] |
|  Review daily POS records, totals, and mapped data.                  [Table][Anal][AI]   |
|                                                                      [ (G) Sync Now ]    |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | DATE        | GROSS SALES | CHECKS | TAX      | NET       | SOURCE                   | |
| |-------------|-------------|--------|----------|-----------|--------------------------| |
| | 2026-04-10  | $4,320.00   | 145    | $210.00  | $4,110.00 | GoogleSheets             | |
| | 2026-04-09  | $3,900.50   | 120    | $180.25  | $3,720.25 | CSV Import               | |
| | 2026-04-08  | $5,120.00   | 185    | $260.00  | $4,860.00 | GoogleSheets             | |
| |                 < 1 2 3 >                            Total Net: $12,690.25         | |
| +--------------------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```
*(On mobile, the table strictly uses `overflowX: auto` requiring horizontal swiping to access the far-right columns.)*

### AI View (`PosAiViewPage`)
Converts the bottom area to alert cards and a chat interface.

```text
+------------------------------------------------------------------------------------------+
|  ✨ POS AI View                                                      [ FROM ▼ ] [ TO ▼ ] |
|  Ask questions, compare patterns, and explore signals.               [Table][Anal][AI]   |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | ⚠️ Anomaly Detected                                                                  | |
| | The cash difference on Friday the 14th was off by 4% compared to the 30-day moving.  | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | Ask AI about POS Data...                                              [ SEND ✈ ]     | |
| +--------------------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```
