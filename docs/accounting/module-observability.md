# Module: Observability

## 1) Scope and responsibility

Observability provides pipeline/sync health visibility and operational diagnostics for accounting.

## 2) UI ownership

Primary page:
- `client/src/modules/accounting/pages/ObservabilityPage.tsx`

Tab label: `Observability`

## 3) API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/accounting/observability/summary` | counts, recent statements, failed runs, quickbooks snapshot, GCP log links |
| `GET` | `/api/accounting/observability/debug` | env readiness + recommended actions |

## 4) Data sources

1. `BankStatement` for lifecycle counts and recent statements.
2. `Run` for failed pipeline/sync jobs.
3. `IntegrationSettings.quickbooks` for sync status and connection details.
4. Optional GCP log links generated from env config.

## 5) Summary payload shape (practical)

- `counts`: total/extracting/structuring/checks_queued/ready_for_review/failed
- `recentStatements[]`: list item DTO + progress + issuesCount
- `failedRuns[]`: run type, job, status, errors, artifacts, updatedAt
- `quickbooks`: normalized settings snapshot
- `gcpLinks`: api logs, worker logs, failed tasks, quickbooks sync log queries

## 6) Diagnostics payload shape

- `envReadiness`:
  - tasks mode
  - GCS/task queue/endpoint secret presence
  - QuickBooks OAuth env presence
  - service name metadata
- `actions[]`:
  - context-specific recommendations, for example:
    - connect QuickBooks
    - refresh references
    - post approved
    - reprocess failed statement

## 7) Module wireframe (implemented behavior)

```text
[Observability]
- health chips: total/extracting/structuring/checks queued/ready/failed
- buttons: Refresh, Refresh Refs, Post Approved
- log shortcut section: API logs | Worker logs | Failed tasks | QB sync
- recent statements table
- failed runs table
- debug diagnostics: optional statementId + actions list
```

## 8) Retry and operations model

1. Statement retries are initiated from Statements module.
2. Check retries are initiated from Statement Detail.
3. Reference refresh and post-approved retries are available in Observability and QuickBooks Sync tabs.
4. Failed run rows provide job context and error details to target the correct retry action.

## 9) Permissions

Server checks:
- summary/debug: `accounting:view`
- quickbooks retry actions (from UI buttons): `quickbooks:sync`
- statement open links: `bankStatements:view`

## 10) Module test expectations

1. Summary endpoint reflects latest run/statement state transitions.
2. Debug endpoint validates optional `statementId` and returns actionable output.
3. GCP log links are null-safe when env is incomplete.
