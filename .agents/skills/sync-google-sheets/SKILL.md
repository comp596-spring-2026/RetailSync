# Skill: Sync Google Sheets

## Goal

Implement safe, scalable, and idempotent synchronization from Google Sheets into internal domain models with proper mapping, diagnostics, and retry support.

---

## Use This Skill When

- adding a new Sheets import flow
- debugging fetch, auth, or mapping issues
- extending mapping for spreadsheet rows
- implementing manual or scheduled sync
- optimizing performance for large sheets

---

## Required Architecture

### Separation of Concerns

- Provider client:
  - `server/src/integrations/google/sheets.client.ts`

- Sync orchestration:
  - `server/src/services/*SyncService.ts`

- Background execution:
  - `server/src/jobs/syncSheets.ts`

- Persistence:
  - `IntegrationSettings` → config, mapping, sync state
  - `IntegrationSecret` → OAuth/service account credentials

---

## Core Sync Principles

### 1. Idempotency (MANDATORY)

- Same sheet data must not create duplicates
- Use:
  - external row identifiers OR
  - deterministic matching keys (e.g., unique columns)

---

### 2. Deterministic Execution

- Same input + same mapping → same output
- No random or stateful transformations

---

### 3. Partial Success Support

- Do NOT fail entire sync due to bad rows
- Process valid rows
- isolate failures

---

## Workflow

### 1. Load Integration Configuration

- Load `IntegrationSettings`
- Validate:
  - sheetId
  - mapping profile
  - sync configuration

---

### 2. Resolve Authentication

Support:

- `oauth`
- `service_account`

Load credentials from `IntegrationSecret`

---

### 3. Acquire Sheets Client

From:

- `server/src/integrations/google/sheets.client.ts`

Ensure:

- token is valid or refreshed
- correct scopes

---

### 4. Fetch Data (OPTIMIZED)

- Use batch range reads
- Avoid per-row API calls

Fetch:

- headers
- rows
- metadata if needed

---

### 5. Normalize Raw Data

- map column headers → stable keys
- trim whitespace
- normalize empty values

---

### 6. Load Mapping Configuration

From:

- `IntegrationSettings.mappingProfiles`

Ensure:

- mapping version is valid
- required fields defined

---

### 7. Transform Rows

Use mapping transformer:

- apply:
  - field mapping
  - type conversion
  - defaults

Output:

- normalized DTOs
- validation errors

---

### 8. Validate Records

For each row:

- required fields present
- type correctness
- business rules (basic)

---

### 9. Upsert Records (IDEMPOTENT)

Use:

- externalId (preferred)
  OR
- composite keys (e.g., name + date)

Rules:

- no duplicates
- safe retries
- preserve existing data unless mapping allows overwrite

---

### 10. Track Sync Run

Persist:

```ts id="yr2wpa"
{
  tenantId,
  provider: "google",
  type: "import",

  status: "success" | "partial" | "failed",

  totalRecords,
  successCount,
  failureCount,

  startedAt,
  completedAt
}
```

---

### 11. Persist Diagnostics

Store:

```ts id="sx3lba"
{
  (rowIndex, externalId, error, retryable);
}
```

---

### 12. Update Integration State

Update `IntegrationSettings`:

- lastSyncAt
- lastSyncStatus
- lastError (if any)

---

## Incremental Sync Strategy (IMPORTANT)

Avoid full reload when possible.

Options:

- timestamp column (`updatedAt`)
- row hash comparison
- stored sync cursor

Store:

```ts id="w8mrrj"
{
  (lastSyncedAt, lastRowHash);
}
```

---

## Concurrency Control

- prevent overlapping sync jobs per tenant
- use:
  - job queue lock OR
  - DB flag

Never run parallel syncs on same sheet.

---

## Retry Strategy

Retry ONLY:

- network failures
- rate limits

Do NOT retry:

- mapping errors
- validation failures

Support:

- retry failed rows only
- manual retry trigger

---

## Error Handling

Classify:

- auth errors → reconnect required
- permission errors → sheet access issue
- validation errors → mapping problem
- transient errors → retry

---

## Rate Limit Handling

- batch reads
- cache metadata
- avoid repeated requests

---

## Observability (CRITICAL)

Every sync must expose:

- sync status
- counts (success/failure)
- failure details
- retry options

UI must be able to:

- view failed rows
- retry failures
- understand cause

---

## Guardrails

- NEVER store tokens outside `IntegrationSecret`
- NEVER hardcode spreadsheet IDs
- NEVER do per-row API calls
- NEVER drop invalid rows silently
- ALWAYS support rerun safety

---

## Anti-Patterns

- treating sheet as perfectly structured data
- assuming headers never change
- reprocessing entire sheet unnecessarily
- not tracking row identity
- ignoring partial failures

---

## File Placement

```id="3w9gft"
server/src/services/googleSheetsSyncService.ts
server/src/services/mapping/
server/src/jobs/syncSheets.ts
```

---

## Example Tasks

- implement incremental sync using timestamp column
- add row-level diagnostics for mapping failures
- optimize batch read for large sheets
- add retry endpoint for failed rows

---

## Deliverables

- sync service implementation
- mapping integration
- idempotent upsert logic
- diagnostics + error tracking
- incremental sync support

---

## Test Requirements

Must cover:

- full sync success
- partial failure
- duplicate row prevention
- retry failed rows
- mapping errors
- auth failure scenario

---

## Final Rule

Google Sheets is not a database.

It is:

- inconsistent
- user-edited
- unpredictable

Your sync must be resilient to bad data, not assume clean input.
