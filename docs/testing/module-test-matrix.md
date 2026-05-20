# Module Test Matrix

Date: 2026-05-20

## Client Modules

| Module | Automated Tests | Primary Assertions |
| --- | --- | --- |
| auth | `modules/auth/pages/LoginPage.test.tsx`, `RegisterPage.test.tsx`, `AcceptInvitePage.test.tsx`, `ForgotPasswordPage.test.tsx`, `ResetPasswordPage.test.tsx`, `VerifyEmailPage.test.tsx`, `CreateCompanyPage.test.tsx`, `modules/auth/api/AuthApi.test.ts`, `app/auth/fetchMeAndSync.test.ts` | public auth pages render, auth API requests are shaped correctly, session bootstrap and redirects work |
| pos | `modules/pos/utils/saleTaxReview.test.ts`, `modules/pos/tests/POSSaleTaxPage.test.tsx`, `modules/pos/tests/POSWorkspacePage.test.tsx`, `modules/pos/tests/posSlice.test.ts`, matching wizard tests | imports, table/analytics/sale-tax view transitions, monthly tax aggregation, vendor compensation math, modal section layout |
| access | `modules/rbac/tests/rbacSlice.test.ts`, `components/PermissionGate.test.tsx`, access page tests | role state and permission-based rendering work |
| settings | settings slice and Google Sheets component tests | integration state, source config, and helper logic stay stable |
| accounting | statements page tests and API contract tests | statements routes and detail flows stay wired |
| quickbooks | `QuickBooksChartOfAccountsPage.test.tsx`, `QuickBooksLiveReadPages.test.tsx`, `QuickBooksMoneyPages.test.tsx`, `QuickBooksWritePages.test.tsx`, QuickBooks page tests under `modules/quickbooks` | hub/page routing, account reads, contact workflows, money CRUD, invoice/payment CRUD |
| procurement | `modules/procurement/pages/ProcurementHubPage.test.tsx` | hidden/placeholder procurement UI stays isolated and does not break app structure |
| app shell | architecture boundary tests, dashboard layout tests, API client tests | top-level app composition and route ownership stay consistent |

## Server Domains

| Domain | Automated Tests | Primary Assertions |
| --- | --- | --- |
| auth/session | `auth.refresh.test.ts`, `authController.test.ts`, `auth.google.test.ts`, `auth.email.test.ts` | refresh rotation, password flows, Google auth, invite/email flows |
| company/onboarding | `companyController.test.ts` | create company and QuickBooks onboarding behavior |
| pos/reports | `posAndReports.test.ts` | POS import/report behavior and scoped access |
| accounting/statements | accounting integration/e2e suites | upload, status, retries, detail, processing pipeline |
| quickbooks services | `quickbooksContactCrudService.test.ts`, `quickbooksMoneyService.test.ts`, other QuickBooks service tests | customer/vendor CRUD and money transaction CRUD service behavior |
| platform | `app.test.ts` and route-level smoke tests | health and core server boot behavior |

## Current Gaps

1. No browser E2E harness is checked in yet.
2. Release validation is still assembled from focused suites rather than one mandatory full journey suite.
3. Hidden/legacy route alias behavior should continue to be watched when QuickBooks/accounting routing changes.
