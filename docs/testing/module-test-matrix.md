# Module Test Matrix

Date: 2026-03-01

## Client Modules

| Module | Automated Tests | Primary Assertions |
| --- | --- | --- |
| auth | `modules/auth/pages/LoginPage.test.tsx`, `CreateCompanyPage.test.tsx`, `JoinCompanyPage.test.tsx`, `modules/auth/api/AuthApi.test.ts`, `app/auth/fetchMeAndSync.test.ts`, guards tests | login entry renders, onboarding forms render, auth API endpoints are called, refresh/bootstrapping behavior works |
| inventory | `modules/inventory/tests/itemsSlice.test.ts`, `modules/inventory/tests/locationsSlice.test.ts`, `components/common/SearchableCrudTable.test.tsx` | item/location thunks update state, delete behavior updates cache, table behavior remains stable |
| pos | `modules/pos/tests/posSlice.test.ts`, `MatchingWizard.test.tsx`, `TotalSalesLine.test.tsx`, `components/ImportPOSDataModal.test.tsx` | overview/daily thunks populate state, mapping wizard UX is stable, chart renders from typed series |
| procurement | `modules/procurement/pages/ProcurementHubPage.test.tsx` | tab navigation works and shell modules render |
| users | `modules/users/tests/companySlice.test.ts` | company set/clear state transitions |
| rbac | `modules/rbac/tests/rbacSlice.test.ts` | modules, roles, selected role state transitions |
| settings | `modules/settings/tests/settingsSlice.test.ts`, `modules/settings/components/googleSheets/debugOutcomeGuide.test.ts` | settings fetch/OAuth state updates and debug outcome helper mappings |
| dev | `modules/dev/pages/demo/HomeDemoPage.test.tsx` | legal/navigation links and demo landing content render |

## Server Modules / Domains

| Domain | Automated Tests | Primary Assertions |
| --- | --- | --- |
| auth/session | `server/src/auth.refresh.test.ts` | refresh rotation, token reuse rejection |
| tenancy | `server/src/tenantIsolation.test.ts` | cross-tenant data isolation |
| inventory | `server/src/inventoryLedger.immutability.test.ts` | immutable inventory ledger semantics |
| pos/reports | `server/src/posAndReports.test.ts` | baseline POS/report API behavior for empty and scoped queries |
| platform | `server/src/app.test.ts` | app/health route contract |

## Gaps (Next)

1. Add browser E2E automation (Playwright/Cypress) for module workflows in `module-e2e-cases.md`.
2. Add inventory/procurement page interaction tests beyond smoke level.
3. Add settings integration tests for Google Sheets sync/delete-source flows with mocked API responses.
