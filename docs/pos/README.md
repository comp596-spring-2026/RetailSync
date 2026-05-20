# POS Module Documentation

Last updated: 2026-05-20

RetailSync POS documentation covers daily record ingestion, workspace views, Google Sheets mapping, and the Georgia / Troup County monthly sales tax review.

## Primary docs

| Document | Purpose |
| --- | --- |
| [sales-tax-review-workflow.md](sales-tax-review-workflow.md) | End-to-end sales tax review: data inputs, formulas, UI, code map, tests |
| [../wireframes/pos-module.md](../wireframes/pos-module.md) | POS workspace wireframes (Table, Analytics, Sale Tax) |
| [../architecture/sheets-integration-flows.md](../architecture/sheets-integration-flows.md) | Google Sheets import and sync into POS daily records |
| [../operations/google-sheets-e2e.md](../operations/google-sheets-e2e.md) | Required mapping targets and POS sync regression checklist |
| [../demo-sheet-info.md](../demo-sheet-info.md) | Demo sheet column names and sample CSV headers |

## Active POS workspace views

The POS hub (`POSWorkspacePage`) exposes three toolbar views:

1. **Table** — daily POS records (`POSDailySummaryPage`)
2. **Analytics** — KPI strip and charts (`POSAnalyticsPage`)
3. **Sale Tax** — Georgia monthly sales tax review (`POSSaleTaxPage`)

Import and Google Sheets configuration remain shared across all views through the workspace toolbar and Settings.

## Quick code map

| Area | Path |
| --- | --- |
| Sales tax page | `client/src/modules/pos/pages/POSSaleTaxPage.tsx` |
| Monthly review engine | `client/src/modules/pos/utils/saleTaxReview.ts` |
| POS workspace shell | `client/src/modules/pos/pages/POSWorkspacePage.tsx` |
| View state | `client/src/modules/pos/state/posSlice.ts` (`PosView`: `table` \| `analytics` \| `saleTax`) |
| Daily POS API | `server/src/controllers/posController.ts` |
| Persisted model | `POSDailySummary` in MongoDB |

For the full sales tax story, start with [sales-tax-review-workflow.md](sales-tax-review-workflow.md).
