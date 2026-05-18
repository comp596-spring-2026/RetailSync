# RetailSync Project Truth

Use this file when an agent needs the current product reality quickly.

## Active visible workspaces

- Dashboard
- POS
- Accounting
- QuickBooks
- Settings
- Access

## Auth and public entry routes

- `/login`
- `/register`
- `/forgot-password`
- `/reset-password`
- `/verify-email`
- `/accept-invite`
- `/onboarding`
- `/onboarding/create-company`
- `/onboarding/join-company`

## Active workspace truth

### Accounting

- visible as statements-first
- canonical pages:
  - `/dashboard/accounting/statements`
  - `/dashboard/accounting/statements/:statementId`
- do not treat QuickBooks as an accounting tab

### QuickBooks

- standalone workspace
- canonical child areas:
  - accounts
  - contacts
  - sales
  - money
  - operations
  - reports
  - tax

### Access

- current visible pages:
  - users
  - roles
- Access Settings is not a current tab

### POS

- current visible product shape:
  - workspace
  - daily summary
  - analytics
  - assistant

### Settings

- owns integration configuration
- especially:
  - Google Sheets
  - QuickBooks connection/config

## Hidden, legacy, or non-primary surfaces

- Inventory is retired from the active product.
- Procurement remains in code but is not release-ready.
- Older accounting aliases may still exist as redirects but should not be treated as current workspace structure.

## Product guardrails

- Do not reintroduce inventory into current nav without explicit direction.
- Do not collapse QuickBooks into accounting nav.
- Do not present procurement as a current production-ready workspace.
- Do not widen visible accounting back into multiple tabs unless explicitly requested.

## Current shared store truth

The main client reducer tree currently includes:

- `auth`
- `company`
- `users`
- `rbac`
- `ui`
- `settings`
- `pos`

Do not write agent docs that invent different current slices without justification.

## Docs that should usually be updated when the visible product changes

- `README.md`
- `docs/status.md`
- `docs/testing/testing-strategy.md`
- `docs/wireframes/**`
