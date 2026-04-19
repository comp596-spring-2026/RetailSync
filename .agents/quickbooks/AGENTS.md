# QuickBooks Specialist

## Purpose

Own the full QuickBooks workspace as a standalone operational product area.

This includes:

- connection state
- accounts
- contacts
- sales
- money
- operations
- reports
- tax
- onboarding-assisted company connect behavior

## Product Boundary

Canonical workspace:

- `/dashboard/quickbooks`
- `/dashboard/quickbooks/accounts`
- `/dashboard/quickbooks/contacts`
- `/dashboard/quickbooks/sales`
- `/dashboard/quickbooks/money`
- `/dashboard/quickbooks/operations`
- `/dashboard/quickbooks/reports`
- `/dashboard/quickbooks/tax`

## RetailSync-Specific Rules

- QuickBooks is a separate workspace, not an accounting sub-tab.
- The QuickBooks home page is a hub, not a tab strip.
- Child pages should feel like full pages with a back path to the hub.
- Group actions by business workflow:
  - contacts
  - sales
  - money
  - operations
  - reporting
- Keep live-read, write, and status concerns understandable to operators.

## Current Supported Functional Surface

- customer CRUD
- vendor CRUD
- invoice CRUD
- payment CRUD
- deposit CRUD
- check CRUD
- expense CRUD
- transfer CRUD
- chart of accounts read/detail
- operations status
- reports and tax

## Write Scope

- `client/src/modules/quickbooks/**`
- `client/src/modules/accounting/pages/QuickBooks*.tsx`
- `server/src/controllers/quickbooks*.ts`
- `server/src/controllers/settings/quickbooksSettingsController.ts`
- `server/src/routes/quickbooksIntegrationRoutes.ts`
- `server/src/integrations/quickbooks/**`
- `server/src/services/quickbooks*.ts`
- QuickBooks tests and docs

## Required Quality Bar

- route ownership stays inside the QuickBooks workspace
- forms are grouped by operator intent
- accounts page is useful beyond a thin table
- contact CRUD feels first-class
- money flows expose checks, expenses, deposits, transfers clearly
- operations is clearly status/audit, not master data

## Must-Test Cases

- connect / reconnect / disconnect
- accounts list and register drill-in
- customer create/edit/deactivate
- vendor create/edit/deactivate
- invoice create/edit/delete
- payment create/edit/delete
- check create/edit/delete
- expense create/edit/delete
- deposit create/edit/delete
- transfer create/edit/delete
- permissions on operations/reports/tax pages

## Anti-Patterns

- collapsing everything back into "live reads" vs "writes"
- mixing QuickBooks route ownership into accounting navigation again
- leaving create flows hidden while read flows are visible
- pretending provider consistency is immediate when it is not
