# RetailSync Workflows and Usage

Last updated: 2026-05-17

This document is the operational companion to the top-level README. It describes the active user-facing flows and keeps the strongest final-demo path easy to follow.

## Recommended Review Order

If you are reviewing the project quickly, use this order:

1. Auth and onboarding
2. Dashboard workspace structure
3. Accounting statements workflow
4. QuickBooks workspace
5. POS and Access as supporting modules

## Monorepo Structure

```text
RetailSync/
  client/
  server/
  shared/
  docs/
```

## Auth Flow

### Email/Password

1. User visits `/login` or `/register`.
2. Registration creates the account and sends a verification email.
3. Verification completes through `/verify-email`.
4. Login or verification confirmation establishes session state.
5. Client calls `/api/auth/me`.
6. If no company exists, user goes to `/onboarding`; otherwise `/dashboard`.

### Google OAuth

1. User clicks Continue with Google.
2. OAuth redirects through server callback.
3. Client receives success redirect.
4. Client loads `/api/auth/me`.
5. User lands in onboarding or dashboard based on company membership.

### Invite Flow

1. Admin sends invite.
2. User opens invite link to `/accept-invite`.
3. Invite page already knows company/email/role context.
4. User sets password and completes account creation directly into that company.

## Onboarding Flow

Available routes:
- `/onboarding`
- `/onboarding/create-company`
- `/onboarding/join-company`

Create-company flow:
- user completes company profile
- user can either create directly or start QuickBooks-assisted company setup

## Dashboard Flow

Visible top-level workspaces:
- Dashboard
- POS
- Accounting
- QuickBooks
- Settings
- Access

Supporting visual reference:
- [App shell wireframe](../wireframes/app-shell.md)

## POS Flow

1. User imports POS data from file or configured Google Sheets source.
2. POS views update across table, analytics, and AI views.
3. Reports remain API-driven and tied to the same company-scoped data.

## Accounting Flow

1. User opens statements workspace.
2. Client detects statement month and uploads the original PDF to the company-scoped storage path.
3. `createStatement` stores the statement record and queues `statement.extract`.
4. Background jobs run `statement.extract`, `statement.structure`, `checks.spawn`, and `check.process`.
5. Statement detail surfaces the source PDF, page images, OCR artifacts, structured JSON, extracted checks, and suggestions.
6. User opens statement detail to monitor status and retry/reprocess work when needed.

Detailed PDF-processing reference:
- [Statement PDF processing workflow](statement-pdf-processing-workflow.md)

Strongest demo emphasis:
- this is the most integrated path in the project today
- it connects auth, tenant scoping, storage, background processing, artifact review, and downstream accounting operations

## QuickBooks Flow

QuickBooks is a dedicated workspace:
- hub dashboard
- accounts
- contacts
- sales
- money
- operations
- reports
- tax

Core QuickBooks user flows:
- customer/vendor CRUD
- invoice/payment CRUD
- deposit/check/expense/transfer CRUD
- account register drill-ins

Supporting visual reference:
- [QuickBooks workspace wireframe](../wireframes/quickbooks-module.md)

## Access Flow

Access is a dedicated hub for:
- users
- roles
- invites
- permission policy

## Important Directional Notes

- Inventory is not part of the current live product.
- Procurement is not considered a release-ready primary workflow.
- QuickBooks is no longer modeled as an accounting tab set.

## Recommended Final Demo Flow

1. Log in with a company-scoped account.
2. Show the dashboard shell and role-aware navigation.
3. Briefly establish the platform surface: POS, Accounting, QuickBooks, Settings, and Access.
4. Enter Accounting and show statement upload, status tracking, artifacts, and review.
5. Transition into QuickBooks to show downstream operational context.
6. Use POS or Access as brief proof that the broader platform is integrated around the same company and permission model.
