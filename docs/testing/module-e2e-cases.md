# Module E2E Cases

Date: 2026-04-17

This is the manual release smoke playbook until a browser E2E harness is introduced.

## Auth

1. Register a user, receive verification email, verify, and land in the correct signed-in flow.
2. Request password reset, open reset link, set a new password, and sign in.
3. Send an invite, open the invite link, accept it, and confirm the user lands in the invited company.
4. Complete Google sign-in and confirm `/api/auth/me` restores dashboard state.

## Onboarding

1. Create company from onboarding and confirm dashboard/company context loads.
2. Join company with valid company code and invite code and confirm company context is attached.
3. Start QuickBooks-assisted company onboarding and confirm the company is created/attached correctly.

## POS

1. Import POS data and confirm rows appear in the table view.
2. Switch between table, analytics, and **Sale Tax** views and confirm each loads without losing context.
3. Trigger Google Sheets-backed POS sync and confirm imported data updates.
4. Open **Sale Tax**, paginate years, and open a month **View Breakdown** modal.
5. Confirm modal sections: Monthly POS Data (3 | 3 split), Tax Calculation (state + county + calculated total), Vendor Compensation, Payable Sales Tax, Daily POS Records with totals footer.
6. Confirm required mapped fields (`highTax`, `lowTax`, `saleTax`, `gas`, `lottery`) drive the review — see [pos/sales-tax-review-workflow.md](../pos/sales-tax-review-workflow.md).

## Accounting

1. Upload a statement and confirm it appears in statements list.
2. Open statement detail and confirm status, processing artifacts, and retry actions render.
3. Trigger reprocess or retry flows and confirm the status updates.

## QuickBooks

1. Open QuickBooks hub and verify cards navigate correctly.
2. Open Accounts and verify chart of accounts plus register drill-in.
3. Open Contacts and create/edit/deactivate a customer and vendor.
4. Open Sales and run invoice and payment CRUD.
5. Open Money and run deposit, check, expense, and transfer CRUD.
6. Open Operations, Reports, and Tax and confirm data loads without route drift.

## Settings

1. Connect and disconnect QuickBooks.
2. Configure Google Sheets source, mapping, and sync.
3. Confirm settings changes persist across refresh.

## Access

1. Open Users and verify user listing, invite actions, and role assignment.
2. Open Roles and verify permission matrix editing and action modal behavior.
3. Confirm limited roles only see allowed navigation and actions.
