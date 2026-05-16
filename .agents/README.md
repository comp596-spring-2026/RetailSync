# RetailSync Agent System

This repository uses a two-layer agent model:

1. `platform / layer agents`
2. `domain specialists`

Use the layer agents to preserve architecture boundaries.
Use the domain specialists to preserve product workflow quality.
Use the skills to preserve repeatable workflow quality.

The goal is to make the same working structure usable from:
- Codex
- Cursor
- Antigravity-style orchestration

## 1. Repo Shape The Agents Must Respect

RetailSync is a production-oriented financial SaaS monorepo with these active surfaces:

- `client/` → React, Vite, Redux Toolkit, MUI, Tailwind
- `server/` → Express, Mongoose, jobs, controllers, services
- `shared/` → schemas, permissions, constants, shared contracts
- `docs/` → status, wireframes, testing, release guidance

### Current product areas

- Auth and onboarding
- Access / RBAC
- POS
- Accounting statements
- QuickBooks
- Settings
- Google Sheets integration

### Important product truths

- Inventory is retired from the active product surface.
- Procurement is still not treated as release-ready.
- Accounting is visible as statements-first.
- QuickBooks is its own workspace.
- Google Sheets setup is driven from Settings and POS import flows.

## 2. Agent Layers

### Layer agents

These enforce technical ownership:

- `.agents/manager/AGENTS.md`
- `.agents/database/AGENTS.md`
- `.agents/backend/AGENTS.md`
- `.agents/integrations/AGENTS.md`
- `.agents/frontend/AGENTS.md`
- `.agents/tester/AGENTS.md`

### Domain specialists

These enforce product/workflow ownership:

- `.agents/auth-onboarding/AGENTS.md`
- `.agents/access-rbac/AGENTS.md`
- `.agents/pos-sheets/AGENTS.md`
- `.agents/accounting-statements/AGENTS.md`
- `.agents/quickbooks/AGENTS.md`
- `.agents/release-docs/AGENTS.md`
- `.agents/settings-integrations/AGENTS.md`
- `.agents/app-shell-navigation/AGENTS.md`
- `.agents/shared-contracts/AGENTS.md`
- `.agents/security-tenancy/AGENTS.md`
- `.agents/ci-release/AGENTS.md`

### Skills

- `.agents/skills/auth-onboarding-workflow.md`
- `.agents/skills/auth-email-flows.md`
- `.agents/skills/rbac-and-route-alignment.md`
- `.agents/skills/pos-sheets-mapping-workflow.md`
- `.agents/skills/statement-processing-workflow.md`
- `.agents/skills/quickbooks-workspace-workflow.md`
- `.agents/skills/quickbooks-crud.md`
- `.agents/skills/test-harness-cleanup.md`
- `.agents/skills/docs-sync.md`
- `.agents/skills/release-readiness-workflow.md`
- `.agents/skills/route-normalization.md`
- `.agents/skills/tenant-safe-backend-change.md`

## 3. How To Use The System

### Rule of thumb

- Choose the domain specialist first.
- Choose the layer agent second.
- If the task is broad, use Manager first and let it decompose the task.

### Examples

- "Fix email verification and invite acceptance"
  - domain: `auth-onboarding`
  - layer: `backend`, `frontend`, `tester`

- "Improve statement upload and retry"
  - domain: `accounting-statements`
  - layer: `backend`, `frontend`, `tester`

- "Add QuickBooks check create/edit/delete"
  - domain: `quickbooks`
  - layer: `integrations`, `backend`, `frontend`, `tester`

- "Change role matrix visibility to match current nav"
  - domain: `access-rbac`
  - layer: `frontend`, `backend`, `tester`

- "Polish Google Sheets setup wizard"
  - domain: `pos-sheets`
  - layer: `frontend`, `backend`, `integrations`, `tester`

- "Normalize dashboard redirects and workspace ownership"
  - domain: `app-shell-navigation`
  - layer: `frontend`, `tester`, `release-docs`

- "Fix shared contract drift across client and server"
  - domain: `shared-contracts`
  - layer: `backend`, `frontend`, `tester`

## 4. Required Delivery Order

Default order:

1. Manager
2. Domain specialist
3. Database, if persistence changes
4. Backend, if API or orchestration changes
5. Integrations, if provider behavior changes
6. Frontend, if UI or state changes
7. Tester
8. Release-docs, if the user-facing surface or rollout story changed

## 4A. Overlap Resolution Matrix

When more than one domain specialist seems relevant, use this priority:

- auth/login/invite/onboarding truth → `auth-onboarding`
- users/roles/invites/permission truth → `access-rbac`
- settings page integration configuration truth → `settings-integrations`
- nav/redirect/workspace ownership truth → `app-shell-navigation`
- POS import and Sheets mapping truth → `pos-sheets`
- statement upload/process/detail truth → `accounting-statements`
- QuickBooks workspace and CRUD truth → `quickbooks`
- cross-layer schema/type truth → `shared-contracts`
- security/tenant protection truth → `security-tenancy`
- workflow/release/test confidence truth → `ci-release` or `release-docs`

## 5. Domain-to-Code Map

### Auth and onboarding

- `client/src/modules/auth/**`
- `client/src/app/guards/**`
- `server/src/controllers/authController.ts`
- `server/src/controllers/authGoogleController.ts`
- `server/src/controllers/companyController.ts`
- `server/src/routes/authRoutes.ts`
- `server/src/routes/companyRoutes.ts`
- `server/src/services/mailer.ts`
- `server/src/services/authSessionService.ts`
- `server/src/services/companyOnboardingService.ts`

### Access / RBAC

- `client/src/modules/users/**`
- `client/src/modules/rbac/**`
- `server/src/controllers/userController.ts`
- `server/src/controllers/roleController.ts`
- `server/src/controllers/inviteController.ts`
- `server/src/middleware/requirePermission.ts`
- `server/src/routes/userRoutes.ts`
- `server/src/routes/roleRoutes.ts`
- `server/src/routes/inviteRoutes.ts`
- `shared/src/permissions/**`

### POS / Google Sheets

- `client/src/modules/pos/**`
- `client/src/modules/settings/components/googleSheets/**`
- `server/src/controllers/posController.ts`
- `server/src/controllers/settings/googleSheetsSettingsController.ts`
- `server/src/controllers/googleSheetsController.ts`
- `server/src/routes/posRoutes.ts`
- `server/src/routes/settingsRoutes.ts`
- `server/src/routes/googleRoutes.ts`
- `server/src/jobs/syncSheets.ts`
- `server/src/utils/googleSheetsSettings.ts`
- `server/src/utils/sheetsSourceResolver.ts`
- `server/src/integrations/google/**`

### Accounting statements

- `client/src/modules/accounting/pages/StatementsPage.tsx`
- `client/src/modules/accounting/pages/StatementDetailPage.tsx`
- `client/src/modules/accounting/components/UploadStatementDialog.tsx`
- `server/src/controllers/accountingController.ts`
- `server/src/routes/accountingRoutes.ts`
- `server/src/jobs/accountingTaskRunner.ts`
- `server/src/jobs/accountingQueue.ts`
- `server/src/models/BankStatement.ts`
- `server/src/models/StatementTransaction.ts`
- `server/src/models/LedgerEntry.ts`

### QuickBooks

- `client/src/modules/quickbooks/**`
- `client/src/modules/accounting/pages/QuickBooks*.tsx`
- `server/src/controllers/quickbooksController.ts`
- `server/src/controllers/quickbooksTaxController.ts`
- `server/src/controllers/settings/quickbooksSettingsController.ts`
- `server/src/routes/quickbooksIntegrationRoutes.ts`
- `server/src/integrations/quickbooks/**`
- `server/src/services/quickbooks*.ts`

### Release docs

- `README.md`
- `RELEASE.md`
- `docs/status.md`
- `docs/testing/**`
- `docs/wireframes/**`
- `docs/backend/**`
- `docs/frontend/**`
- `docs/architecture/**`

### Settings & integrations

- `client/src/modules/settings/**`
- `server/src/controllers/settings/**`
- `server/src/routes/settingsRoutes.ts`

### App shell & navigation

- `client/src/app/App.tsx`
- `client/src/app/layout/**`
- `client/src/app/guards/**`

### Shared contracts

- `shared/src/**`

### Security & tenancy

- `server/src/middleware/**`
- `server/src/models/plugins/**`
- auth/session and permission-sensitive controllers

### CI & release

- `.github/workflows/**`
- CI/test harness files
- PR/release markdown

## 6. Non-Negotiable Constraints

- No agent may reintroduce inventory into the active product without explicit direction.
- No agent may collapse QuickBooks back into accounting nav.
- No agent may bypass RBAC or tenant isolation.
- No agent may hide integration failures instead of surfacing them.
- No agent may weaken idempotency, retry safety, or external ID tracking.

## 7A. Quick Launch Recipes

### Codex

Backend bug:

```bash
codex --cwd /Users/trupal/Projects/RetailSync --agent-file .agents/backend/AGENTS.md
```

QuickBooks UI task:

```text
Use .agents/quickbooks/AGENTS.md, .agents/frontend/AGENTS.md, and .agents/skills/quickbooks-workspace-workflow.md.
```

### Cursor

Recommended prompt pattern:

```text
Use .agents/<domain>/AGENTS.md, .agents/<layer>/AGENTS.md, and .agents/skills/<skill>.md.
```

### Antigravity

Use:

- `.agents/templates/antigravity-system-prompt.md`
- `.agents/templates/task-prompt-template.md`
- `.agents/PROJECT-TRUTH.md`

## 7. Platform Usage

### Codex

Use:

```bash
codex --cwd /Users/trupal/Projects/RetailSync --agent-file .agents/<agent>/AGENTS.md
```

### Cursor

Use the `.cursor/rules/*.mdc` rules plus explicit prompts like:

```text
Use .agents/quickbooks/AGENTS.md and .agents/frontend/AGENTS.md.
Restructure the QuickBooks Money page without changing backend behavior.
```

### Antigravity-style orchestration

Use:

- `.agents/manager/AGENTS.md` for decomposition
- `.agents/templates/antigravity-system-prompt.md`
- `.agents/templates/task-prompt-template.md`
- `.agents/PROJECT-TRUTH.md`

The orchestrator should pass:

- one owner
- one writable scope
- explicit dependencies
- validation requirements

## 8. Suggested Task Routing Matrix

| Task type | Domain specialist | Layer agents |
|---|---|---|
| Email verification, invite, login, reset | `auth-onboarding` | `backend`, `frontend`, `tester` |
| Role matrix, users, invites, guarded routes | `access-rbac` | `backend`, `frontend`, `tester` |
| Settings workspace integration UX | `settings-integrations` | `frontend`, `backend`, `tester` |
| POS import, Sheets mapping, setup wizard | `pos-sheets` | `frontend`, `backend`, `integrations`, `tester` |
| Statement upload, detail page, processing pipeline | `accounting-statements` | `backend`, `frontend`, `integrations`, `tester` |
| QuickBooks contacts, money, reports, writes | `quickbooks` | `integrations`, `backend`, `frontend`, `tester` |
| Route ownership, nav cleanup, shell redirects | `app-shell-navigation` | `frontend`, `tester`, `release-docs` |
| Shared schema and permission contract changes | `shared-contracts` | `backend`, `frontend`, `tester` |
| Security and tenancy hardening | `security-tenancy` | `backend`, `tester`, `release-docs` |
| CI health, release packaging, PR readiness | `ci-release` | `tester`, `release-docs`, `manager` |
| Release notes, wireframes, module audits | `release-docs` | `manager`, `tester` |

## 9. Quality Standard

An agent task is not complete until it is:

- architecturally placed correctly
- consistent with the visible product
- type-safe
- tested at the correct layer
- documented if the product shape changed

## 10. Recommended Skill Pairings

| Domain | Recommended skills |
|---|---|
| `auth-onboarding` | `auth-onboarding-workflow`, `auth-email-flows`, `tenant-safe-backend-change` |
| `access-rbac` | `rbac-and-route-alignment`, `route-normalization`, `tenant-safe-backend-change` |
| `settings-integrations` | `pos-sheets-mapping-workflow`, `quickbooks-workspace-workflow`, `docs-sync` |
| `pos-sheets` | `pos-sheets-mapping-workflow`, `test-harness-cleanup`, `docs-sync` |
| `accounting-statements` | `statement-processing-workflow`, `tenant-safe-backend-change`, `docs-sync` |
| `quickbooks` | `quickbooks-workspace-workflow`, `quickbooks-crud`, `tenant-safe-backend-change` |
| `shared-contracts` | `tenant-safe-backend-change`, `docs-sync` |
| `ci-release` | `release-readiness-workflow`, `docs-sync`, `test-harness-cleanup` |
