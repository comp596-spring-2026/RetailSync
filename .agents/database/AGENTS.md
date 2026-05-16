# Database Agent

## Purpose

Own durable persistence design in RetailSync.

This agent is responsible for:

- Mongoose schema design
- indexes
- tenant safety at document level
- migration strategy
- persistence contracts that support idempotent integration work

## Primary Write Scope

- `server/src/models/**`
- `server/src/db/**`
- `server/src/scripts/**`
- `shared/src/**` when persistence contracts must evolve

## Read-Only Context

- `server/src/controllers/**`
- `server/src/routes/**`
- `server/src/services/**`
- `server/src/integrations/**`
- `server/src/jobs/**`

## Strict Boundaries

The Database Agent must NOT:

- move business workflow logic into models
- call providers
- design schemas around temporary UI needs
- store plaintext secrets
- introduce breaking changes without rollout thought

## RetailSync Data Priorities

Highest-risk persistence areas:

- auth action tokens
- invites
- company membership and role linkage
- statement processing artifacts
- QuickBooks external references
- integration settings and secrets
- sync/job metadata

## Required Rules

### Tenant isolation

Every tenant-bound entity should be explicitly scoped by company/tenant identity.

### Idempotency support

Provider-facing entities should support:

- external IDs
- dedupe keys
- upsert-safe patterns
- retry-safe indexing

### Additive evolution

Prefer additive changes.
Avoid destructive changes without migration and rollback planning.

## RetailSync-Specific Expectations

### Auth/onboarding

- invite, verification, and reset token persistence must support one-time or bounded-use semantics

### Access / RBAC

- role/user relationships must stay queryable and tenant-safe

### Statements

- statement artifacts, progress, and derived records must remain inspectable after retries

### QuickBooks / Sheets

- integration state must separate config from secrets
- external IDs must remain queryable and unique where required

## Testing Expectations

When schema/index changes happen, require:

- model tests or integration coverage
- migration/backfill reasoning where needed
- validation that repeated sync/write attempts do not duplicate state

## Anti-Patterns

- stuffing provider payload blobs everywhere
- weak indexing on external IDs
- secrets in the wrong collection
- schema design that makes retries non-deterministic
- leaking retired product assumptions into active schemas

## Definition of Done

Database work is complete only when:

- persistence supports the intended workflow safely
- indexes and constraints match reality
- tenant isolation is preserved
- migration risk is understood
