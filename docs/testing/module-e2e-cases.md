# Module E2E Cases

Date: 2026-03-01

This playbook defines end-to-end scenarios to run manually now and automate later.

## Auth

1. Login + Session Bootstrap
   - Given a valid Google-authenticated user
   - When user lands on `/login` and completes login
   - Then `/api/auth/me` succeeds and user is routed to `/dashboard` or `/onboarding` based on company state
2. Refresh Token Recovery
   - Given an expired access token and valid refresh cookie
   - When a protected API request returns 401
   - Then client refreshes token once and retries original request
3. Logout
   - Given an authenticated dashboard session
   - When user clicks logout
   - Then `/api/auth/logout` is called and app state clears auth/company data

## Inventory

1. Items CRUD
   - Create item, edit item, delete item from inventory pages
   - Verify table reflects latest data and permissions gate actions correctly
2. Item CSV Import
   - Upload valid CSV through Items import
   - Verify success snackbar and refreshed item list
3. Location CRUD + Stock by Location
   - Create/update/delete location
   - Verify location lookup endpoint returns scoped stock details
4. Inventory Move
   - Move stock between two locations
   - Verify ledger entry and location balances update

## POS

1. CSV Import to POS Table
   - Import valid CSV from POS toolbar/modal
   - Verify rows appear in table view and KPI cards update in analytics view
2. Google Sheets Sync
   - Configure sheet mapping in settings
   - Trigger sync from POS toolbar
   - Verify import count, `lastSyncAt`, and daily totals update
3. View Toggle Persistence
   - Switch Table/Analytics icons
   - Reload page and verify same view/icon-only preference from localStorage
4. Date Range + Pagination
   - Change date range and paging controls
   - Verify daily endpoint queries and totals align with selected range

## Procurement

1. Invoices/Suppliers Hub Tabs
   - Navigate to `/dashboard/procurement`
   - Switch between Invoices and Suppliers tabs
   - Verify correct module-shell content and permission-based actions

## Users

1. List Users + Assign Role
   - Open users module
   - Assign a role to another user
   - Verify list refresh and role update persists
2. Invite Lifecycle
   - Create invite with role and expiry
   - Verify invite list includes new row
   - Delete invite and confirm removal
3. Company Onboarding Continuation
   - Create/join company from onboarding flow
   - Verify user is routed to dashboard and company context persists

## RBAC

1. Role CRUD
   - Create role with module permissions
   - Edit role permissions and save
   - Delete non-system role
2. Permission Enforcement
   - Login as limited role
   - Verify forbidden routes/actions are hidden or blocked

## Settings

1. Google Mode Switch
   - Toggle OAuth vs shared/service mode
   - Verify persisted mode after refresh
2. Shared Sheet Configure + Verify
   - Save profile config, verify access, list tabs
   - Validate debug/log flow in setup UI
3. Mapping Save + Delete Source
   - Save mapping for POS source
   - Execute soft delete and hard delete flows
   - Verify expected config/data behavior per delete type
4. Sync Schedule
   - Configure sync schedule and timezone
   - Verify server accepts schedule and next run state is reflected

## Accounting

1. Statement Upload to Ledger Readiness
   - Upload PDF from Statements tab
   - Verify lifecycle transitions: uploaded -> extracting -> structuring -> checks_queued -> ready_for_review
   - Verify check cards unlock progressively
2. Statement Recovery Flows
   - Trigger failed check and retry from Statement Detail
   - Trigger statement reprocess and verify pipeline restarts from selected job
3. Ledger Canonical Review
   - Filter entries, approve/exclude rows, execute bulk approve
   - Verify transition guards (posted rows not editable, excluded approve guard)
4. QuickBooks Approval-Only Posting
   - Connect QuickBooks and run reference refresh
   - Run post-approved and verify only approved + not-posted rows are posted
   - Verify partial failures do not abort batch and are visible in posting status
5. Observability Diagnostics
   - Validate summary counts + failed runs render
   - Run debug diagnostics with/without statementId and verify recommended actions

## Dev

1. Demo + Legal Navigation
   - Open `/home-demo`
   - Validate privacy/terms/data deletion links
2. Playground Runtime Checks
   - Open `/playground`
   - Run health, auth, DB, and env readiness checks
   - Verify status chips and detail output for success/failure paths
