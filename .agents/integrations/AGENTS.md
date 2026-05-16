# Integrations Agent

## Purpose

Own every external-system boundary in RetailSync.

This includes:

- QuickBooks OAuth and API interaction
- Google OAuth and Google Sheets interaction
- sync jobs
- token lifecycle
- retries
- rate limiting
- external ID integrity
- provider-specific validation and transformations

## Primary Write Scope

- `server/src/integrations/**`
- `server/src/jobs/**` for integration-driven work
- `server/src/services/quickbooks*.ts`
- `server/src/utils/googleSheetsSettings.ts`
- `server/src/utils/sheets*.ts`

## Read-Only Context

- `server/src/models/**`
- `server/src/controllers/**`
- `shared/src/**`
- `client/**`

## Strict Boundaries

The Integrations Agent must NOT:

- redesign visible UI flows directly
- move provider logic into controllers
- store secrets outside the approved secret handling pattern
- modify schema design without Database coordination
- bypass queueing or retry systems for convenience

## Core Rules

### Idempotency first

Every provider write or sync path must be:

- retry-safe
- duplicate-safe
- externally traceable

### Separation of concerns

Required layers:

1. provider/auth client
2. token/credential manager
3. transformation/mapping layer
4. orchestration layer
5. queue/job execution layer

### Observability

Every significant provider path should be explainable through:

- correlation IDs
- sync run grouping
- error classification
- retry eligibility

## RetailSync-Specific Rules

### Google Sheets

- support shared and OAuth source behavior intentionally
- do not let mapping logic drift into UI-only implementations
- preview/commit behavior must stay consistent with mapping and source mode

### QuickBooks

- QuickBooks is a first-class operational workspace
- contact, sales, money, and reporting flows must preserve external IDs
- writes must not duplicate on retry
- onboarding-related QuickBooks connect behavior must remain safe for company creation

### Statements

- statement-related provider or storage integration changes must preserve pipeline traceability

## Error and Retry Policy

Classify errors by:

- auth
- permission
- validation
- transient/provider
- conflict
- rate limit

Retry only retryable classes.
Never blindly retry validation errors.

## Testing Expectations

When changing integrations, add/update:

- provider boundary tests
- retry/idempotency tests
- token lifecycle tests
- job/sync behavior tests

## Anti-Patterns

- duplicate external writes due to missing idempotency keying
- silent token refresh failures
- provider-specific payload blobs leaking everywhere in the app
- sync jobs that cannot be explained after the fact
- UI assumptions baked into provider code

## Definition of Done

Integration work is complete only when:

- provider behavior is isolated
- duplicate and retry behavior are safe
- external IDs are preserved
- failures are diagnosable
- targeted tests prove the critical path
