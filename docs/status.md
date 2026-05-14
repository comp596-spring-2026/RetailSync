# RetailSync Execution Status

Last updated: 2026-05-14

This file tracks the current implementation state of the live product surfaces, backend workflows, and validation posture.

Primary companion docs:
- [docs/architecture/workflows-and-usage.md](/Users/trupal/Projects/RetailSync/docs/architecture/workflows-and-usage.md)
- [docs/architecture/statement-pdf-processing-workflow.md](/Users/trupal/Projects/RetailSync/docs/architecture/statement-pdf-processing-workflow.md)
- [docs/frontend/routing-and-permission-gates.md](/Users/trupal/Projects/RetailSync/docs/frontend/routing-and-permission-gates.md)
- [docs/backend/api-reference.md](/Users/trupal/Projects/RetailSync/docs/backend/api-reference.md)
- [docs/testing/module-test-matrix.md](/Users/trupal/Projects/RetailSync/docs/testing/module-test-matrix.md)
- [docs/wireframes](/Users/trupal/Projects/RetailSync/docs/wireframes)

Status legend:
- `DONE`: implemented and active in the product
- `PARTIAL`: implemented but still needs hardening, broader tests, or UX cleanup
- `HIDDEN`: code or routes still exist, but the area is intentionally not part of the active product surface
- `PLANNED`: documented target state, not implemented yet

---

## Product Summary

RetailSync is currently centered on:
- email/password auth plus Google auth
- onboarding with create-company, join-company, and invite acceptance
- RBAC-driven dashboard navigation
- POS import and reporting
- accounting statements workflow
- a standalone QuickBooks workspace for operational accounting tasks
- Google Sheets and QuickBooks integration management in Settings

Inventory has been removed from the active product and is no longer part of the supported user flow.

---

## Current Scenario Snapshot

As of 2026-05-14, the current live accounting scenario is:
- accounting is statements-first in the visible product shell
- statement detail is the active month-close and suggestion review workspace
- ledger and QuickBooks posting remain downstream operational workspaces
- the statement PDF pipeline documentation and storage contract are now documented and aligned with the codebase
- overall product direction is stable, while release confidence remains `PARTIAL`

Operational nuance worth calling out:
- the statement pipeline itself is implemented and demoable
- post-processing after statement review still depends on ledger approval and QuickBooks posting readiness rather than being completed entirely inside the statement detail workflow

---

## Phase Overview

| Phase | Scope | Status | Notes |
|---|---|---|---|
| Phase 0 | Foundation, auth, onboarding, shell, RBAC | `DONE` | Current auth/onboarding model is live |
| Phase 1 | POS imports and reporting | `DONE` | Daily and monthly POS flows are active |
| Phase 2 | Email auth hardening, reset, verify, invites, SMTP | `DONE` | Password flows and invite-based access are active |
| Phase 3 | Statements workflow and QuickBooks operational workspace | `DONE` | Statements are the visible accounting surface; QuickBooks is a separate workspace |
| Phase 4 | Procurement, invoice OCR, reconciliation expansion | `PLANNED` | Not active as a production-ready module yet |
| DevOps | CI/CD, Docker, release flow, docs | `PARTIAL` | CI and deploy workflows exist; full green release verification still depends on runner/tooling state |

---

## Active User Flow

### Authentication
- `/login`: `DONE`
- `/register`: `DONE`
- `/accept-invite`: `DONE`
- `/forgot-password`: `DONE`
- `/reset-password`: `DONE`
- `/verify-email`: `DONE`
- Google OAuth sign-in: `DONE`

### Onboarding
- `/onboarding`: `DONE`
- `/onboarding/create-company`: `DONE`
- `/onboarding/join-company`: `DONE`
- Invite acceptance directly provisions the user into the invited company role: `DONE`
- QuickBooks-first company onboarding path: `DONE`
  - User can start company creation by connecting QuickBooks
  - Successful QuickBooks onboarding can auto-create the company and attach the integration

### Dashboard Navigation
Visible top-level workspaces:
- Dashboard
- POS
- Accounting
- QuickBooks
- Settings
- Access

Hidden or redirected legacy entry points:
- Procurement-related aliases still exist in routing for compatibility, but are not part of the intended active nav
- Legacy accounting QuickBooks routes redirect into the standalone QuickBooks workspace

---

## Module Status

| Module | Backend | Frontend | Permissions | Tests | Status |
|---|---|---|---|---|---|
| dashboard | Shell/read context | Dashboard home | `DONE` | `PARTIAL` | `DONE` |
| auth | Register/login/verify/reset/refresh/logout/me | All auth pages active | `DONE` | `PARTIAL` | `DONE` |
| onboarding/company | Create company, join company, onboarding status, QuickBooks onboarding | Active onboarding pages | `DONE` | `PARTIAL` | `DONE` |
| access/users | User listing, role assignment, invite lifecycle | Access hub + users | `DONE` | `PARTIAL` | `DONE` |
| rolesSettings | Role CRUD + permission matrix | Access hub + roles | `DONE` | `PARTIAL` | `DONE` |
| pos | Import, daily tables, analytics, AI view | Active POS workspace | `DONE` | `PARTIAL` | `DONE` |
| reports | Summary/report endpoints | Reports surface still reachable through product flows and exports | `DONE` | `PARTIAL` | `DONE` |
| accounting/statements | Statement upload, status, detail, retries, processing | Active accounting workspace | `DONE` | `PARTIAL` | `DONE` |
| quickbooks | Hub, accounts, contacts, sales, money, operations, reports, tax | Active standalone workspace | `DONE` | `PARTIAL` | `DONE` |
| settings | Google Sheets + QuickBooks integration management | Active settings workspace | `DONE` | `PARTIAL` | `DONE` |
| procurement | Placeholder/partial routing only | Hidden from active nav | `PARTIAL` | `TODO` | `HIDDEN` |
| inventory | Removed from active application | Removed from active application | n/a | legacy tests removed | `HIDDEN` |

---

## Accounting and QuickBooks State

### Accounting
Visible accounting is intentionally narrowed to statements:
- statement list
- statement detail
- processing lifecycle
- retry/reprocess controls

The previous broader accounting tab model is no longer the intended primary UX. Legacy routes for ledger and observability redirect away from the visible accounting flow.

### QuickBooks
QuickBooks is now a standalone workspace with:
- hub dashboard
- accounts / chart of accounts
- contacts
- sales
- money
- operations
- reports
- tax

Implemented QuickBooks workflows include:
- invoices: create, list, detail, edit, delete
- payments: create, list, detail, edit, delete
- checks: create, list/detail via live views, edit, delete
- expenses: create, list/detail via live views, edit, delete
- deposits: create, list/detail via live views, edit, delete
- transfers: create, list/detail via live views, edit, delete
- customers: create, edit, deactivate
- vendors: create, edit, deactivate

Known product nuance:
- several pages still reuse accounting-layer components internally, but the active route and UX model is QuickBooks-first

---

## Auth and Email State

Implemented:
- SMTP-backed verification email delivery
- forgot password flow
- reset password flow
- invite email delivery
- invite acceptance route
- Google auth success continuation
- cookie-based refresh rotation

Environment/config readiness required for production:
- `CLIENT_URL`
- `MONGO_URI`
- `ENCRYPTION_KEY`
- Google OAuth env
- QuickBooks OAuth env
- SMTP credentials

---

## Testing Status

### Current automated coverage areas
- client auth page tests
- client QuickBooks page tests
- client POS/procurement/access/settings slice and page tests
- server auth controller and Google auth tests
- server email/invite flow tests
- server QuickBooks CRUD service tests
- server statement fixture extraction script
- shared schema/type build validation

### Current validation confidence
- focused module/unit coverage is substantial
- broader release confidence is still `PARTIAL` because a full green end-to-end release gate depends on local/CI runtime availability for Node, Mongo memory server, and hosted runner execution

### Current gaps
- browser E2E remains planned, not required yet
- release verification across all active modules is still assembled from focused suites rather than one single mandatory end-to-end job
- hidden/redirected legacy routes still exist and should continue to be watched during refactors

---

## Known Drift / Cleanup Still Worth Doing

- Some QuickBooks detail pages still share older accounting-owned implementations even though route ownership and workspace plumbing now live under the dedicated QuickBooks module.
- Procurement remains intentionally hidden rather than fully deleted from every historical reference.
- The release path should eventually include a stricter hosted green-run requirement before merging to `production`.

---

## Recommended Near-Term Priorities

1. Keep the active product surface tight: auth, POS, statements, QuickBooks, settings, access.
2. Continue reducing route drift from older accounting aliases and compatibility paths.
3. Add stronger release validation for active user journeys before broadening module scope again.
4. Treat procurement/reconciliation/invoice OCR as explicit future initiatives, not implied production-complete surfaces.

---

## Release Readiness Summary

Current release candidate themes:
- auth/onboarding overhaul
- inventory removal
- QuickBooks workspace restructuring
- docs and wireframe refresh
- deploy workflow environment consolidation

Overall release posture:
- product direction: `READY`
- codebase scope: `SUBSTANTIAL`
- validation posture: `PARTIAL`
- recommended merge model: PR into `production` only after command-level validation is re-run in a working Node environment and reviewed
