# Skill: Sync QuickBooks

## Goal

Implement safe, idempotent, and audit-ready synchronization with QuickBooks, including:

- OAuth-secured API access
- reference data sync (pull)
- financial posting (export)
- reconciliation and reporting

This system must prevent duplicate financial records and support retry-safe operations.

---

## Use This Skill When

- building QuickBooks reference sync (accounts, vendors, customers)
- implementing posting of approved accounting entries
- debugging OAuth, token refresh, or rate-limit issues
- handling duplicate exports or reconciliation
- extending reporting or financial workflows

---

## Required Architecture

### Separation of Concerns

- OAuth + provider client:
  - `server/src/services/quickbooksService.ts`

- Sync orchestration:
  - `server/src/services/quickbooksSyncService.ts`

- Domain-specific logic:
  - `server/src/services/quickbooksTaxService.ts`

- Background execution:
  - `server/src/jobs/accountingQueue.ts`
  - `server/src/jobs/accountingTaskRunner.ts`

---

### Persistence

- `IntegrationSecret`
  - accessToken
  - refreshToken
  - expiry
  - realmId

- `IntegrationSettings`
  - connection state
  - sync metadata
  - last sync status

- Domain models:
  - must store `externalId` for every exported entity

---

## Core Principles

### 1. Idempotency (CRITICAL)

Every export MUST:

- prevent duplicate posting
- use:
  - externalId
  - or dedupe keys

Rules:

- never create same transaction twice
- always persist externalId after success

---

### 2. Eventual Consistency Awareness

QuickBooks is NOT strongly consistent.

- writes may not appear immediately
- retries may occur before visibility

System must:

- tolerate delayed reads
- avoid duplicate writes during retries

---

### 3. Auditability

Every operation must be traceable:

- what was sent
- what succeeded
- what failed
- what was retried

---

## Workflow

### 1. Load Integration State

- load `IntegrationSettings`
- load `IntegrationSecret`

Validate:

- connection is active
- realmId exists

---

### 2. Ensure Token Freshness

- check expiry
- refresh if needed
- persist updated tokens

---

### 3. Execute Provider Request

- use centralized request layer
- handle:
  - retries
  - rate limits
  - token refresh

---

## Reference Sync (PULL)

### Examples:

- Chart of Accounts
- Vendors
- Customers

### Steps:

1. fetch data from QuickBooks
2. normalize into internal format
3. upsert into MongoDB
4. persist external IDs
5. update sync metadata

---

## Financial Posting (EXPORT)

### Steps:

1. validate internal record
2. check for existing externalId
   - if exists → skip or reconcile

3. build QuickBooks payload
4. send request
5. persist:
   - externalId
   - sync timestamp

6. record success or failure

---

### Idempotency Rules

- every record must have stable identity
- prevent duplicate export by:
  - checking existing externalId
  - using unique constraints if needed

---

## Reconciliation

Handle:

- duplicate posting attempts
- mismatched states
- partial success

Strategy:

- compare internal vs external state
- update internal record if safe
- flag conflicts for manual resolution

---

## Error Handling

Classify errors:

- auth → reconnect required
- validation → mapping issue
- rate-limit → retry
- transient → retry
- conflict → reconcile

---

### Retry Rules

Retry ONLY:

- transient failures
- rate-limit errors

DO NOT retry:

- validation errors
- mapping errors

---

## Partial Success Handling

- allow batch operations to succeed partially

- track:
  - successCount
  - failureCount

- persist failed records separately

- allow retry of failed subset

---

## Rate Limit Handling

- centralize request execution
- apply throttling
- respect provider limits
- avoid burst requests

---

## Concurrency Control

Prevent:

- duplicate exports
- overlapping sync jobs

Use:

- job queue locks
- idempotency keys

---

## Observability (CRITICAL)

Every operation must log:

- tenantId
- provider
- operation type (pull/export)
- status
- failure reason

Persist:

- sync runs
- error logs
- retry eligibility

---

## Guardrails

- NEVER post without externalId tracking
- NEVER duplicate token refresh logic
- NEVER expose raw provider errors to UI
- NEVER call QuickBooks directly from controllers
- NEVER assume immediate consistency

---

## Anti-Patterns

- exporting same record multiple times
- not storing externalId
- retrying all failures blindly
- ignoring reconciliation
- mixing provider logic into business logic

---

## File Placement

```id="2s4l8x"
server/src/services/quickbooksService.ts
server/src/services/quickbooksSyncService.ts
server/src/services/quickbooksTaxService.ts
server/src/jobs/accountingQueue.ts
server/src/jobs/accountingTaskRunner.ts
```

---

## Example Tasks

- implement idempotent posting for ledger entries
- add retry-safe QuickBooks export job
- build reconciliation logic for duplicate transactions
- add reference sync for chart of accounts

---

## Deliverables

- integration-safe service implementation
- idempotent export logic
- retry and error classification
- reconciliation handling
- observability support

---

## Test Requirements

Must cover:

- successful export
- duplicate prevention
- token refresh flow
- rate-limit retry
- partial failure
- reconciliation scenario

---

## Final Rule

QuickBooks is a financial system.

If sync is wrong:

- money is wrong
- reports are wrong
- trust is broken

Treat every export as a financial transaction, not a data sync.
