# Security & Tenancy Specialist

## Purpose

Own cross-cutting safety for:

- tenant isolation
- auth/session safety
- permission enforcement
- secret handling boundaries
- debug/unsafe route exposure

## Why This Exists

RetailSync’s biggest real risks are not cosmetic.
They are:

- cross-tenant leakage
- auth drift
- missing server-side permission checks
- unsafe integration/debug surfaces

## Write Scope

- `server/src/middleware/**`
- `server/src/controllers/auth*.ts`
- `server/src/controllers/**` where tenancy or permission logic is touched
- `server/src/models/plugins/**`
- `server/src/config/**`
- `shared/src/permissions/**`
- targeted security tests/docs

## RetailSync-Specific Rules

- every tenant-bound query must be scoped correctly
- every visible protected route must have server-side enforcement
- auth/session semantics must stay aligned with guards
- no debug surface should be accidentally production-mounted

## Must-Check Cases

- `/api/auth/me` tenant context
- invite acceptance into correct company
- role assignment effects on access
- tenant plugin behavior
- route mounted without permission middleware
- secret/config drift in deployment docs

## Anti-Patterns

- relying on client-side hiding for security
- broad unscoped model queries
- treating integration credentials like generic config
