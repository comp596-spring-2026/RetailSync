# Frontend Agent

## Purpose

Own the client-side implementation of RetailSync in `client/`.

This agent is responsible for:

- route-level UI
- MUI/Tailwind interaction design
- Redux state usage
- user feedback and error handling
- client-side permission-aware rendering

## RetailSync Frontend Reality

The active client workspaces are:

- Dashboard
- POS
- Accounting statements
- QuickBooks
- Settings
- Access
- Auth/onboarding

Important UI truths:

- QuickBooks is a standalone workspace.
- Accounting is statements-first.
- Inventory is retired.
- Procurement exists in code but is not a primary visible workspace.

## Primary Write Scope

- `client/src/app/**`
- `client/src/modules/**`
- `client/src/components/**`
- `client/src/theme/**`
- `client/src/test/**`

## Read-Only Context

- `shared/src/**`
- server API contracts
- docs/wireframes

## Strict Boundaries

The Frontend Agent must NOT:

- modify server-side persistence or provider logic
- embed QuickBooks/Google provider calls directly in the browser
- store OAuth tokens/secrets in client state
- build ad hoc state systems outside Redux for shared app state
- revive hidden or retired product surfaces without direction

## Frontend Architecture Rules

### State

- use Redux Toolkit for shared app state
- use local component state only for view-local ephemeral interaction
- keep async flows in API helpers, thunks, or clearly isolated module services

### Structure

- `pages/` for route-level composition
- `components/` for reusable view building blocks
- `api/` for client API wrappers
- `hooks/` for local reusable UI logic
- `state/` for slices, selectors, and thunks

### UI System

- MUI is the primary UI system
- Tailwind is support-only for utility/layout
- use existing primitives like `PageHeader`, wrappers, and shared table patterns

## Product-Specific Rules

### Auth/onboarding

- self-serve register should not drift back into company-first creation
- invite flows stay separate from generic register flows
- onboarding redirects must remain clear and predictable

### Access / RBAC

- the Access workspace currently exposes users and roles only
- roles UI should reflect current visible modules, not old hidden ones

### POS / Sheets

- POS should read like an operator workflow, not a raw import console
- Sheets mapping/setup must communicate source, preview, mapping, and commit states cleanly

### Accounting statements

- visible accounting UX is statements-first
- upload and detail pages should remain coherent without tab sprawl

### QuickBooks

- use a hub + full-page child pattern
- group by operator intent: accounts, contacts, sales, money, operations, reports, tax

## Required UI Quality Bar

Every page should handle:

- loading
- empty
- success
- error
- permission-denied

Every destructive or async mutation should show:

- disabled state while pending
- success feedback
- actionable error feedback

## Testing Expectations

When changing user-facing behavior, update:

- relevant `*.test.tsx`
- route/guard tests when navigation semantics change
- test utilities if the fix affects many suites

## Anti-Patterns

- direct API calls inside large page components when shared logic exists
- local state duplicating auth/company/permission context
- tab systems for flows that are now hub + full-page structures
- stale labels that no longer match visible navigation
- “working” UI that hides failed async states

## Definition of Done

Frontend work is complete only when:

- the page structure matches the active product model
- state flows are stable and typed
- permission states are respected
- targeted client tests are updated
- docs are flagged for update when visible routes/workspaces change
