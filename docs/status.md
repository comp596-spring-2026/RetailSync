# RetailSync Execution Status

Last updated: 2026-02-27

This file tracks end-to-end implementation status by phase and module.

**Workflows and usage:** See [docs/architecture/workflows-and-usage.md](architecture/workflows-and-usage.md) for detailed login, onboarding, POS import sources, no-POS-data behavior, reports, and RBAC flows.

**Usage flow (summary):** Unauthenticated → `/login` → Google OAuth → `/auth/google/success` → `GET /api/auth/me` → if no company → `/onboarding` (create or join company); if company → `/dashboard`. POS/reports require company; when no POS data, daily list returns `[]` and monthly summary returns zeroed totals; client shows empty state and optional hints.

Status legend:
- `DONE`: implemented and integrated
- `PARTIAL`: implemented but needs hardening/tests/polish
- `TODO`: not started
- `REITERATED`: implemented, then revised/reworked after feedback or verification

---

## Phase Overview

| Phase | Scope | Status | Notes |
|---|---|---|---|
| Phase 0 | Foundation (auth + onboarding + RBAC + shell) | `DONE` | Running architecture baseline in place |
| Phase 1 | POS import + monthly reporting | `DONE` | Server APIs + client pages complete |
| Phase 2 | Items + locations + inventory ledger + inventory workspace | `REITERATED` | CRUD/import/move/aggregate complete; new workspace + API paths |
| Phase 3 | Invoice OCR + confirm flow | `TODO` | Next major build |
| Phase 4 | Bank statements + reconciliation + payments allocation | `TODO` | Planned after Phase 3 |
| DevOps | Docker + CI/CD + docs | `PARTIAL` | CI quality/tests/build gates active; Docker publishing is manual-only |

---

## Phase 0: Foundation

### Auth
- Register/login/refresh/logout/me endpoints: `DONE`
- Access token (15m): `DONE`
- Refresh cookie (7d, HttpOnly, SameSite=Lax): `DONE`
- Axios 401 refresh retry: `DONE`
- Forced logout on refresh fail: `DONE`

### Onboarding / Company
- Create company flow: `DONE`
- Join company flow (companyCode + inviteCode + email): `DONE`
- User starts with `companyId = null`: `DONE`
- Company code generation (`RS-XXXXXX`): `DONE`

### RBAC / Multi-tenant
- Role model permission map: `DONE`
- Default roles (Admin/Member/Viewer): `DONE`
- Server `requirePermission(module, action)`: `DONE`
- Client `hasPermission` + `PermissionGate`: `DONE`
- `req.companyId` attach in auth middleware: `DONE`
- Tenant filtering in protected controllers: `PARTIAL`
  - Core implemented
  - Needs additional future enforcement audits as new modules are added

### Dashboard shell
- Protected routes: `DONE`
- Sidebar module visibility by `view` permission: `DONE`
- No-access guard screen path: `DONE`

---

## Phase 1: POS + Reports

### Server
- `POSDailySummary` model: `DONE`
- `POST /api/pos/import` CSV upload + parse + validate + upsert: `DONE`
- `GET /api/pos/daily`: `DONE`
- `GET /api/reports/monthly-summary`: `DONE`
- Permission gating (`pos:create + pos:import`, `pos:view`, `reports:view`): `DONE`

### Client
- `/dashboard/pos` upload + table: `DONE`
- `/dashboard/reports` monthly cards: `DONE`
- Permission-based action rendering: `DONE`

### Data and tooling
- Sample POS CSV dataset: `DONE`
- POS seed script: `DONE`

---

## Phase 2: Items + Locations + Inventory Ledger + Workspace

### Server models
- `Item`: `DONE`
- `Location`: `DONE`
- `InventoryLedger` (event sourcing): `DONE`

### Server endpoints
- Items CRUD + import under inventory namespace: `DONE`
  - `GET/POST /api/inventory/items`
  - `PUT/DELETE /api/inventory/items/:id`
  - `POST /api/inventory/items/import`
- Locations CRUD under inventory namespace: `DONE`
  - `GET/POST /api/inventory/locations`
  - `PUT/DELETE /api/inventory/locations/:id`
- Inventory move endpoint: `DONE`
  - `POST /api/inventory/move`
- Inventory by location aggregate: `DONE`
  - `GET /api/inventory/location/:code`
- Permission checks on all above: `DONE`
- Tenant isolation tests updated to use new inventory paths: `DONE`

### Client pages
- Inventory workspace (`/dashboard/operations`): `DONE`
  - Items table section (`ItemsTableSection` with Redux `itemsSlice`): `DONE`
  - Inventory sections (search by barcode, view by location, move inventory): `DONE`
  - Store layout viewer (`StoreLayoutViewer`, `LocationCarousel`, `LocationGrid`, `SlotDetailsDrawer`): `DONE`
- Legacy `/dashboard/items` and `/dashboard/locations` kept as shells but underlying logic now reusable via shared components: `REITERATED`

### Validation behavior
- Zod request validation across new endpoints: `DONE`
- Standard response shape adherence: `DONE`

---

## Phase 3: Invoices OCR (Planned)

### Target server work
- Supplier invoice models: `TODO`
- Upload storage pipeline (multer + metadata): `TODO`
- OCR provider abstraction + stub parser: `TODO`
- Preview endpoint: `TODO`
- Confirm endpoint -> purchase ledger events: `TODO`

### Target client work
- `/dashboard/invoices` upload + preview + confirm UI: `TODO`
- Item mapping UX (UPC + fuzzy suggestions): `TODO`

### Target tests
- Upload validation tests: `TODO`
- Confirm idempotency tests: `TODO`

---

## Phase 4: Bank + Reconciliation (Planned)

### Target server work
- `BankTransaction` model: `TODO`
- Bank file upload + parser stub: `TODO`
- Reconciliation suggestions API: `TODO`
- Match confirm/unmatch APIs: `TODO`
- Payment allocation API: `TODO`

### Target client work
- `/dashboard/bank`: `TODO`
- `/dashboard/reconciliation`: `TODO`
- `/dashboard/payments`: `TODO`

### Target algorithm work
- Deposit matching windows/tolerance: `TODO`
- EFT mapping `(creditCard - gas)`: `TODO`
- Vendor payment allocation heuristics: `TODO`

---

## Module-by-Module Status

| Module | Backend | Frontend | Permissions | Tests | Status |
|---|---|---|---|---|---|
| dashboard | Shell only | Home cards/shell | `DONE` | `PARTIAL` | `PARTIAL` |
| pos | Import + daily APIs | POS page + Import modal | `DONE` | `PARTIAL` | `DONE` |
| reports | Monthly summary API | Reports page | `DONE` | `PARTIAL` | `DONE` |
| items | CRUD + import APIs (inventory namespace) | Items table + workspace section | `DONE` | `PARTIAL` | `DONE` |
| locations | CRUD APIs (inventory namespace) | Locations + layout viewer | `DONE` | `PARTIAL` | `DONE` |
| inventory | Move + location aggregate APIs | Inventory workspace sections | `DONE` | `PARTIAL` | `DONE` |
| users | List + assign role | Users page | `DONE` | `PARTIAL` | `PARTIAL` |
| rolesSettings | Role CRUD + module catalog | Roles page | `DONE` | `PARTIAL` | `PARTIAL` |
| invoices | Placeholder shell only | Placeholder shell | `PARTIAL` | `TODO` | `TODO` |
| bankStatements | Placeholder shell only | Placeholder shell | `PARTIAL` | `TODO` | `TODO` |
| reconciliation | Placeholder shell only | Placeholder shell | `PARTIAL` | `TODO` | `TODO` |
| suppliers | Placeholder shell only | Placeholder shell | `PARTIAL` | `TODO` | `TODO` |

---

## Reiterations / Rework Log

| Item | Why it was reiterated | Outcome |
|---|---|---|
| Permission/action catalog | Needed core-module action alignment | Updated shared module actions |
| POS import validation path | Needed stronger row-level failure handling | Added explicit validation error reporting |
| Sidebar links behavior | Duplicate/mis-gated users link path | Simplified to permission-driven links + roles shortcut |
| TS path resolution (server/client) | Typecheck failures for shared package imports | Added TS path mapping fixes |
| Docker build lockfile strategy | Lockfile mismatch blocked image build | Dockerfiles switched to `--no-frozen-lockfile` |
| Client permissions test strictness | TS strict null checks in container build | Updated tests with explicit non-null assertions |
| Inventory domain (items/locations/inventory) | Needed unified namespace + workspace | Moved to `/api/inventory/*` and added workspace UI |

---

## Test Status

### Implemented tests
- Server: health endpoint smoke test: `DONE`
- Server: auth refresh rotation (including old refresh token reuse rejection): `DONE`
- Server: tenant isolation read/write protections and aggregate scoping: `DONE`
- Server: inventory ledger immutability: `DONE`
- Server: inventory/items/locations route tests under `/api/inventory/*`: `DONE`
- Client: permission utility tests: `DONE`
- Client: `PermissionGate` render behavior tests: `DONE`
- Client: `ImportPOSDataModal` multi-source flow tests: `DONE`

### Needed test expansion
- Onboarding edge-case tests (invite mismatch/expired paths): `TODO`
- RBAC middleware route coverage across all module/action combinations: `TODO`
- POS import parser failure paths and idempotency tests: `TODO`
- Items/locations CRUD negative paths and validation matrix: `TODO`
- End-to-end happy-path smoke flows (Playwright/Cypress): `TODO`
- Coverage threshold gate in CI (line/branch/function targets): `TODO`

---

## DevOps / Production Readiness Status

### Done
- Docker artifacts (server/client/compose): `DONE`
- CI gate workflow (quality/tests/build): `DONE`
- Release image workflow to GHCR (manual dispatch): `DONE`
- Detailed docs + runbooks + architecture diagrams: `DONE`
- PR template (production-grade): `DONE`

### Pending hardening
- Full CI execution confirmation in hosted runner after mongodb-memory-server lock hardening: `IN_PROGRESS`
- Branch protection rules activation: `TODO`
- Secrets/env governance finalization: `TODO`
- Coverage reporting and threshold policy in CI: `TODO`

---

## Current Blockers Observed

- GitHub runner occasionally hit `mongodb-memory-server` binary lock contention in test setup.
- CI now isolates Mongo binary cache per job and clears stale lock files before running tests, but this still needs one confirmed green run on hosted CI.

No confirmed application-code design blocker is currently open.

---

## Next Recommended Execution Order

1. Phase 3 invoice OCR server scaffolding + client flow.
2. Add integration tests for Phase 0/1/2 critical paths.
3. Phase 4 bank/reconciliation core APIs.
4. Introduce E2E regression suite and require it in CI.
5. Final production hardening pass (error budgets, observability, rollback drills).

---

## Sprint Planning Linkage

Canonical sprint planning files:

- `docs/roadmap/sprints/README.md`
- `docs/roadmap/sprints/sprint-plan.md`
- `docs/roadmap/sprints/sprint-commit-policy.md`

Current sprint execution status:

| Sprint | Primary Scope | Current Status |
|---|---|---|
| Sprint 1 | Tenant/security hardening | `IN_PROGRESS` |
| Sprint 2 | Tests + CI + Docker reliability | `IN_PROGRESS` |
| Sprint 3 | Invoice OCR scaffolding | `TODO` |
| Sprint 4 | Invoice hardening | `TODO` |
| Sprint 5 | Bank ingestion | `TODO` |
| Sprint 6 | Reconciliation + payments | `TODO` |

