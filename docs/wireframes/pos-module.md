# Point of Sale (POS) Module Wireframe

Path: `/client/src/modules/pos/pages/POSWorkspacePage.tsx`

The POS hub uses a shared date-range control panel and toolbar that govern three workspace views: **Table**, **Analytics**, and **Sale Tax**.

## Shared Toolbar

```text
+------------------------------------------------------------------------------------------+
|  POS Workspace                          [ FROM ▼ ] [ TO ▼ ]   [Table][Analytics][Sale Tax] |
|                                                                      [ Sync Now ]          |
+------------------------------------------------------------------------------------------+
```

- **Table** — daily record review
- **Analytics** — KPI strip and charts
- **Sale Tax** — Georgia / Troup County monthly sales tax review

Detailed sales tax behavior: [docs/pos/sales-tax-review-workflow.md](../pos/sales-tax-review-workflow.md)

## Layout Sketch (Analytics Sub-View)

```text
+------------------------------------------------------------------------------------------+
|  📊 POS Analytics View                                               [ FROM ▼ ] [ TO ▼ ] |
|  Analyze sales trends, distribution, and patterns.              [Table][Analytics][Sale Tax] |
|                                                                      [ (G) Sync Now ]    |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| |  KPI Strip                                                                           | |
| |  [ Total ]  [ Net Inc ]  [ Credit ]  [ Cash ]  [ Gas ]  [ Lottery ]  [ Tax ]         | |
| +--------------------------------------------------------------------------------------+ |
|                                                                                          |
| +----------------------------------------+ +-------------------------------------------+ |
| |  Sales Trends (Line Chart)             | |  Tender Distribution (Pie Chart)          | |
| +----------------------------------------+ +-------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```

## Sub-View Wireframes

### Daily Summary View (`POSDailySummaryPage`)

Filters apply to a paginated data table of daily POS rows.

```text
+------------------------------------------------------------------------------------------+
|  📟 POS Table View                                                   [ FROM ▼ ] [ TO ▼ ] |
|  Review daily POS records, totals, and mapped data.              [Table][Analytics][Sale Tax] |
|                                                                      [ (G) Sync Now ]    |
|                                                                                          |
| +--------------------------------------------------------------------------------------+ |
| | DATE     | HIGH TAX | LOW TAX | SALE TAX | GAS | LOTTERY | ...                       | |
| |----------|----------|---------|----------|-----|---------|---------------------------| |
| | 04/10/26 | $809.59  | $832.03 | $81.58   | ... | ...     |                           | |
| +--------------------------------------------------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```

*(On mobile, the table uses horizontal scroll for far-right columns.)*

### Sale Tax View (`POSSaleTaxPage`)

Year pager and monthly cards; card opens the breakdown modal.

```text
+------------------------------------------------------------------------------------------+
|  Georgia Sales Tax Review — Troup County, GA                    [ ◀ 2026 ▶ ]             |
|                                                                                          |
| +------------------------+  +------------------------+  +------------------------+     |
| | January 2026           |  | February 2026          |  | March 2026             |     |
| | Total Tax Collected    |  | ...                    |  | ...                    |     |
| | Vendor Compensation    |  |                        |  |                        |     |
| | Payable Sales Tax      |  |                        |  |                        |     |
| | [ View Breakdown → ]   |  |                        |  |                        |     |
| +------------------------+  +------------------------+  +------------------------+     |
+------------------------------------------------------------------------------------------+
```

### Monthly Sales Tax Breakdown modal

```text
+------------------------------------------------------------------------------------------+
|  Monthly Sales Tax Breakdown                                                             |
|  January 2026 — Troup County, GA                                                         |
|                                                                                          |
|  1. Monthly POS Data                                                                     |
|  ┌─────────────────────────────┬─────────────────────────────┐                         |
|  │ High Tax Food    $29,741.00 │ Gasoline Sales  $122,608.48 │                         |
|  │ Low Tax Grocery  $31,661.05 │ Lottery Sales    $19,584.50 │                         |
|  │ Total Tax Coll.   $2,512.58 │ Total Sales     $190,949.64 │                         |
|  └─────────────────────────────┴─────────────────────────────┘                         |
|                                                                                          |
|  2. Tax Calculation                                                                      |
|  ┌ State Tax ────────────────┬ County Tax ────────────────┐                              |
|  │ Tax Base / Rate / Due     │ Tax Base / Rate / Due       │                              |
|  └───────────────────────────┴─────────────────────────────┘                              |
|  Calculated Sales Tax                                           $3,031.70                |
|                                                                                          |
|  3. Vendor Compensation   4. Payable Sales Tax   5. Daily POS Records                    |
|                                                                                          |
|                                                              [ Close ]                   |
+------------------------------------------------------------------------------------------+
```

Section formulas and field mapping: [sales-tax-review-workflow.md](../pos/sales-tax-review-workflow.md)
