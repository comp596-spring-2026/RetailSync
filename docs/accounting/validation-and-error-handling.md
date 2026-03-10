# Validation and Error Handling Contract

## 1) Validation layers

1. Shared Zod contracts in `shared/src/accounting/schemas.ts` validate request and payload shapes.
2. Controller-level guard clauses enforce tenant and auth requirements.
3. Worker-level guards enforce required IDs per job type.
4. Posting-level validations enforce required proposal fields by transaction type.

## 2) Core validation rules

### 2.1 Upload and create

1. Upload URL payload requires valid file name and PDF content type.
2. `createStatement` validates:
   - objectId-compatible `statementId`
   - deterministic company/month/statement path match
   - GCS object exists/readable for hash computation

### 2.2 Task payload

1. `/api/tasks/pipeline` accepts only pipeline job types.
2. `/api/tasks/sync` accepts only sync job types.
3. payload must satisfy `accountingTaskPayloadSchema`.
4. secret auth via `x-internal-task-secret` when configured.

### 2.3 Ledger and posting

1. Ledger edit payload validates through `updateLedgerEntrySchema`.
2. Bulk approve requires non-empty `entryIds`.
3. Post-approved selection requires:
   - `reviewStatus=approved`
   - `posting.status in [not_posted, failed]`
   - no `posting.qbTxnId`

### 2.4 QuickBooks typed posting requirements

1. `Expense`: `bankAccountId` + `categoryAccountId`
2. `Deposit`: `bankAccountId` + `categoryAccountId`
3. `Transfer`: `bankAccountId` + `transferTargetAccountId`
4. `Check`: `bankAccountId` + `categoryAccountId`

If typed requirements fail, fallback journal attempt runs.

## 3) Error response contract

HTTP error shape:

```json
{
  "status": "error",
  "message": "...",
  "details": {}
}
```

Success shape:

```json
{
  "status": "ok",
  "data": {}
}
```

## 4) End-to-end error matrix

| Stage | Error Type | Automated Behavior | User Surface |
| --- | --- | --- | --- |
| `statement.extract` | missing statement/path | run failed, statement `failed`, issue appended | Statements tab failed badge + reprocess |
| `statement.extract` | OCR/artifact write fail | run failed, statement `failed` | Statement detail issue banner |
| `statement.structure` | parsing/normalization fail | run failed, statement `failed` | Statement status failed |
| `checks.spawn` | candidate generation fail | run failed, statement `failed` | statement issue + reprocess |
| `check.process` | check missing / write fail | check `failed`, run failed, progress recompute | check card failed + retry |
| ledger edit/approve/exclude | invalid transition | `409` | inline error/snackbar |
| `quickbooks.refresh_reference_data` | OAuth/API error | sync status set to `error` with message | QuickBooks/Observability status error |
| `quickbooks.post_approved` | proposal validation error | mark entry `posting.failed`, continue batch | Ledger posting error column |
| `quickbooks.post_approved` | typed + fallback fail | mark failed with combined message | failure details visible for correction |
| SSE stream | disconnect | client can continue polling | no hard-stop; eventual consistency |

## 5) Retry rules

1. Statement and check retries are explicit user actions.
2. Failed posting rows are retried by running post-approved again after correction.
3. Reruns do not duplicate already-posted rows because `qbTxnId` gating excludes them.

## 6) Observability guarantees

1. Every job creates a `Run` row with status and errors.
2. `failedRuns` are visible in Observability summary.
3. QuickBooks sync statuses (`lastPull*`, `lastPush*`) provide run outcomes and counts.
