# Data Model and Storage (Accounting)

## 1) Storage split

1. GCS stores immutable files and derived artifacts.
2. MongoDB stores structured entities, pointers to artifacts, statuses, proposals, and run history.

## 2) GCS deterministic layout

All statement artifacts are rooted under:

`companies/<companyId>/statements/<yyyy>/<mm>/<statementId>/`

Concrete paths:

```text
companies/<companyId>/statements/<yyyy>/<mm>/<statementId>/
  original/
    statement.pdf
  derived/
    pages/
      page-001.png
      page-002.png
    ocr/
      docai.json
      text.txt
    gemini/
      normalized.v1.json
    checks/
      extracted/
        <checkId>/
          front.jpg
          ocr.json
          structured.v1.json
```

Path generation is centralized in:
- `server/src/services/accountingStorageService.ts`

## 3) Mongo collections

### 3.1 `BankStatement`

Purpose: statement-level lifecycle and progress.

Key fields:
- `companyId`
- `status`: `uploaded | extracting | structuring | checks_queued | ready_for_review | failed`
- `gcs.rootPrefix`, `gcs.pdfPath`
- `progress.totalChecks/checksQueued/checksProcessing/checksReady/checksFailed`
- `hash` (dedupe signal)
- `issues[]`

Indexes:
- `{ companyId: 1, statementMonth: -1, createdAt: -1 }`
- `{ hash: 1 }`

### 3.2 `StatementTransaction`

Purpose: structured statement row record.

Key fields:
- `statementId`, `companyId`
- `postDate`, `description`, `merchant`, `amount`, `type`, `checkNumber`
- `sourceLocator` and `evidence`
- `proposal` mirror
- `reviewStatus`
- `posting` mirror

Index:
- `{ companyId: 1, statementId: 1, postDate: -1 }`

### 3.3 `StatementCheck`

Purpose: independent check processing unit.

Key fields:
- `statementId`, `companyId`
- `status`: `queued | processing | ready | needs_review | failed`
- `confidence` breakdown
- `autoFill`
- `gcs.frontPath/backPath/ocrPath/structuredPath`
- `match.statementTransactionId`, `matchConfidence`, `reasons[]`
- `errors[]`

Indexes:
- `{ companyId: 1, statementId: 1, createdAt: -1 }`
- `match.statementTransactionId` index

### 3.4 `LedgerEntry`

Purpose: canonical review/posting surface.

Key fields:
- `sourceType=statement`
- `statementId`, `statementTransactionId`, optional `statementCheckId`
- transaction fields (`date`, `description`, `amount`, `type`)
- `attachments` (PDF/page/check pointers)
- `confidence`, `proposal`, `reviewStatus`
- `posting.status/qbTxnId/error/postedAt/attempts`
- optional `fallbackJournalLines`

Indexes:
- unique `{ companyId: 1, statementId: 1, statementTransactionId: 1 }`
- query index `{ companyId: 1, reviewStatus: 1, posting.status: 1, date: -1 }`

### 3.5 `Run`

Purpose: pipeline and sync observability.

Key fields:
- `companyId`, optional `statementId`
- `runType`: `pipeline | sync`
- `job`
- `status`: `queued | running | success | failed`
- `metrics`, `artifacts`, `errors[]`, `traceId`

Indexes:
- `{ companyId: 1, runType: 1, status: 1, updatedAt: -1 }`
- `{ companyId: 1, statementId: 1, job: 1, createdAt: -1 }`

### 3.6 `QuickBooksReference`

Purpose: normalized cache for QB vendors/customers/employees.

Used by matching and sync UX.

## 4) Mirror consistency rules

1. Proposal and review changes in ledger are mirrored to linked `StatementTransaction`.
2. Posting status changes are mirrored from ledger to transaction during sync.
3. Check enrichment updates statement check and patches the linked ledger entry.

## 5) Tenant boundary

All accounting collections include `companyId` and use tenant-scoped queries.
