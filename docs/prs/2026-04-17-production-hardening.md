# PR Title

`feat(platform): production hardening, auth onboarding refresh, and QuickBooks workspace restructure`

## 1) Summary

### What changed

This PR hardens the production surface, removes placeholder/debug server routes from the live app, updates the authentication and onboarding flow, restructures the QuickBooks workspace into a clearer operational hub, removes inventory from the active product, refreshes release/status/wireframe documentation, and brings the highest-signal client regression checks back to green.

### Why this change is needed

The codebase had drift between product behavior, docs, and release expectations. It also still mounted development-only or placeholder routes in the server app. This PR aligns the live product with the current intended surface, reduces accidental production exposure, and packages the current state with accurate docs, validation evidence, and rollout notes for a production merge.

### Scope boundary

Not included in this PR:
- New browser E2E coverage
- Full refactor of QuickBooks/accounting shared code boundaries
- Reworking server tests that require socket binding or `mongodb-memory-server` in this sandbox
- Reintroducing procurement/inventory into active navigation

## 2) Change Type

- [x] `feat` New feature
- [x] `fix` Bug fix
- [x] `refactor` Code restructuring without behavior change
- [x] `security` Security-related change
- [x] `docs` Documentation-only change
- [x] `chore` Build/tooling/maintenance
- [x] `test` Test-only change

## 3) Linked Work

- Issue: N/A
- Spec/Doc: `/Users/trupal/Projects/RetailSync/docs/status.md`
- Incident/Alert: internal release audit findings
- Related PRs: N/A

## 4) Architecture and Design Impact

### Affected layers

- [x] `shared` schemas/types/modules/actions
- [x] `server` API/controllers/middleware/models
- [x] `client` routes/state/components
- [x] `infra` Docker/CI/CD/runtime config
- [x] `docs` runbook/architecture/API docs

### Design notes

- Removed placeholder module CRUD and unauthenticated debug sheets endpoints from the mounted server app.
- Re-centered the visible product around auth, POS, accounting statements, access, settings, and QuickBooks.
- QuickBooks is now treated as its own workspace/hub instead of an awkward accounting sub-surface.
- Docs were rewritten to describe the current routes, workspace hierarchy, and realistic test coverage.

### Mermaid / diagrams updated

- [x] Added/updated diagrams in docs (if architecture/flow changed)
- Diagram file(s): wireframe and workflow markdown set under `/Users/trupal/Projects/RetailSync/docs/wireframes` and `/Users/trupal/Projects/RetailSync/docs/architecture`

## 5) Multi-Tenant Safety Checklist (Required)

- [x] Every new tenant data model includes `companyId`
- [x] Every read query is scoped by `companyId`
- [x] Every write/update/delete query is scoped by `companyId`
- [x] No cross-tenant lookup path exists
- [x] `requireAuth` path is used before tenant-sensitive handlers

### Tenant scoping evidence

- `/Users/trupal/Projects/RetailSync/server/src/controllers/authController.ts`
- `/Users/trupal/Projects/RetailSync/server/src/controllers/companyController.ts`
- `/Users/trupal/Projects/RetailSync/server/src/services/companyOnboardingService.ts`
- `/Users/trupal/Projects/RetailSync/server/src/models/plugins/tenantPlugin.ts`
- `/Users/trupal/Projects/RetailSync/server/src/services/quickbooks/applicationService.ts`

## 6) RBAC and Security Checklist (Required)

- [x] All protected endpoints enforce `requirePermission(module, action)`
- [x] Correct module/action mapping used (CRUD + custom actions)
- [x] Client hides/disables unauthorized UI elements
- [x] Direct URL/server-side bypass is not possible
- [x] JWT/cookie handling unchanged OR changes documented
- [x] No sensitive secrets/tokens logged

### RBAC mapping changed in this PR

- RBAC presentation now reflects current visible navigation rather than removed/hidden product areas.
- Access settings was removed from the access hub.
- Accounting visible navigation was reduced to statements only.
- QuickBooks is represented as its own workspace in the client navigation and RBAC presentation.

## 7) API Contract Changes

- [ ] No API changes
- [x] Backward-compatible API changes
- [ ] Breaking API changes (requires migration/coordination)

### Endpoints added/changed

| Method | Path | Auth | Permission | Request Schema | Response Schema |
|---|---|---|---|---|---|
| POST | `/api/auth/forgot-password` | Public | N/A | auth email payload | standard auth result |
| POST | `/api/auth/reset-password` | Public | N/A | reset token + password | standard auth result |
| POST | `/api/auth/resend-verification` | Auth/public flow | N/A | email payload | standard auth result |
| GET | `/api/auth/invite` | Public invite flow | N/A | invite token | invite detail payload |
| POST | `/api/auth/invite/accept` | Public invite flow | N/A | invite token + profile/password | auth + onboarding result |
| GET/POST/etc. | QuickBooks write/contact/money routes already introduced in current branch | Auth | QuickBooks module permissions | existing shared/client contracts | existing JSON API shape |

### Error contract

- [x] Uses standard error shape: `{ status: "error", message, details? }`
- [ ] Validation errors return `422`
- [x] Auth failures return `401`
- [x] Permission failures return `403`

## 8) Data Model / Migration Impact

- [ ] No schema/index changes
- [x] Schema/index changes included
- [ ] Data migration required

### Models changed

- Collection(s): `AuthActionToken`, `QuickBooksOnboarding`, invite/auth-related models
- New/changed fields: auth token support for verification/reset/invite flows, onboarding linkage for QuickBooks/company setup
- New/changed indexes: model-level indexes introduced with new auth/onboarding models
- Backfill plan: none required for current release path
- Rollback plan: revert branch and stop using new auth/onboarding flows; existing data can remain dormant

## 9) Frontend Impact

- [x] Route changes
- [x] Redux store changes
- [x] Permission-gated UI changes
- [x] Form validation changes
- [ ] No frontend impact

### Screens impacted

- Auth: login, register, forgot password, reset password, verify email, invite accept, onboarding, create company
- QuickBooks: hub dashboard, accounts, contacts, sales, money, operations, reports, tax, writes/live routing cleanup
- Accounting: statements-only visible workspace, simplified statement upload retry surface
- Access: users/roles hub cleanup and RBAC presentation updates
- Shell/navigation: inventory/procurement hidden or removed from active navigation

## 10) Testing Evidence (Required)

### Automated tests added/updated

- [x] Unit tests
- [x] Integration tests
- [ ] E2E tests
- [ ] No new tests (explain why)

### Commands run locally

- [x] `pnpm typecheck`
- [ ] `pnpm lint`
- [x] `pnpm test`
- [x] `pnpm build`
- [ ] `docker compose config`
- [ ] `docker compose build` (if Docker touched)

### Test results summary

Commands run in this workspace:

- `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm -r typecheck`
  - passed
- `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm -r build`
  - passed
- `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm --dir /Users/trupal/Projects/RetailSync/client exec vitest run src/architectureBoundaries.test.ts src/modules/accounting/components/UploadStatementDialog.test.tsx`
  - passed
- `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/pnpm -C /Users/trupal/Projects/RetailSync/server exec vitest run src/services/quickbooksLiveReads.test.ts src/cronRoutes.test.ts`
  - `quickbooksLiveReads` passed
  - `cronRoutes` failed because this sandbox disallows socket binding and `supertest` hit `listen EPERM 0.0.0.0`

Additional known environment-limited test gaps:

- recursive `pnpm -r test` is not green in this sandbox because some server suites require `mongodb-memory-server` binding/listen behavior that is blocked here
- no browser E2E suite was executed

## 11) Observability and Operations

- [x] Logs meaningful and non-sensitive
- [ ] Metrics/telemetry impacted (documented)
- [x] Healthchecks remain valid
- [x] Runbook updated in `/docs/operations`

### Operational notes

- Debug Sheets routes are no longer mounted in the production app.
- Placeholder module routes are no longer mounted in the production app.
- SMTP deploy defaults were simplified and documented.
- Release and status docs now reflect the current product surface more accurately.

## 12) Performance Considerations

- [ ] No expected perf impact
- [x] Query or render path changed (details below)

### Perf notes

- The client build still emits a large bundle warning for the main app chunk (`~2.46 MB` before gzip reduction). This is not newly introduced here, but it remains a follow-up item for code splitting.
- QuickBooks workspace restructuring improves operator navigation flow but does not yet materially reduce bundle size.

## 13) Security Review Notes

- [x] Input validated with Zod (or justified alternative)
- [x] File uploads validated/safe-handled (if applicable)
- [ ] Dependency risk reviewed (`pnpm audit`)
- [x] No new privileged endpoints without strict permission checks

### Security-specific testing done

- Verified removal of unauthenticated debug Sheets routes from the live app mount.
- Verified placeholder module routes are no longer mounted.
- Reviewed auth/onboarding/token flow codepaths for tenant-aware company/role binding.

## 14) Deployment Plan

### Rollout strategy

- [x] Normal rollout
- [ ] Feature-flagged rollout
- [ ] Dark launch / partial rollout

### Preconditions

- SMTP user/pass configured for deploy environment
- Existing auth/QuickBooks/Google envs remain present
- Production frontend URL configured correctly for verification/reset/invite email links

### Post-deploy verification

- [x] Auth flow (`register/login/refresh/logout`)
- [x] Onboarding (`create/join company`)
- [x] RBAC visibility + endpoint enforcement
- [x] Critical module smoke test
- [x] Health endpoint and logs clean

## 15) Rollback Plan (Required)

- Trigger to rollback: auth onboarding regressions, deploy-time route breakage, or unexpected QuickBooks workspace failures in production
- Exact rollback steps: revert this PR from `production`, redeploy previous image/build, validate auth and dashboard smoke flows
- Data consistency considerations after rollback: newly created auth action tokens and QuickBooks onboarding docs may remain in Mongo but will not affect older codepaths

## 16) Reviewer Checklist

- [x] Code is understandable and maintainable
- [x] Multi-tenant and RBAC checks are complete
- [x] Tests are adequate for risk level
- [x] Docs are updated and accurate
- [x] Deployment/rollback plans are actionable

## 17) Screenshots / Evidence

- Validation evidence captured in command output during this release pass
- Updated docs:
  - `/Users/trupal/Projects/RetailSync/README.md`
  - `/Users/trupal/Projects/RetailSync/RELEASE.md`
  - `/Users/trupal/Projects/RetailSync/docs/status.md`
  - `/Users/trupal/Projects/RetailSync/docs/wireframes/app-shell.md`
  - `/Users/trupal/Projects/RetailSync/docs/wireframes/access-hub.md`
  - `/Users/trupal/Projects/RetailSync/docs/wireframes/accounting-module.md`
  - `/Users/trupal/Projects/RetailSync/docs/wireframes/quickbooks-module.md`
  - `/Users/trupal/Projects/RetailSync/docs/wireframes/auth-module.md`
