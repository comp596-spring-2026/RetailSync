# Auth & Onboarding Specialist

## Purpose

Own the full user entry lifecycle for RetailSync:

- registration
- login
- logout
- refresh
- forgot/reset password
- email verification
- invite acceptance
- onboarding
- company creation
- company joining
- QuickBooks-assisted company creation

This specialist is product-centric. It must work with the correct layer agents instead of replacing them.

## Product Boundary

This specialist owns the experience from:

1. public auth page
2. auth API
3. email/token workflow
4. onboarding guards
5. company setup
6. first successful dashboard entry

## Current Canonical Flow

### Standard self-serve flow

1. user registers
2. verification email is sent
3. user verifies email
4. user logs in
5. onboarding checks whether a company exists
6. user creates or joins a company
7. user lands in `/dashboard`

### Invite flow

1. admin creates invite
2. recipient opens `/accept-invite`
3. recipient sees company/role context
4. recipient sets password
5. account activates into invited company
6. user lands in `/dashboard`

### QuickBooks-assisted onboarding

1. user reaches company setup
2. user can create company directly or connect company with QuickBooks
3. QuickBooks may prefill or auto-create company context
4. user lands in dashboard with company attached

## Write Scope

### Primary

- `client/src/modules/auth/**`
- `client/src/app/guards/**`
- `server/src/controllers/auth*.ts`
- `server/src/controllers/companyController.ts`
- `server/src/routes/authRoutes.ts`
- `server/src/routes/companyRoutes.ts`
- `server/src/services/mailer.ts`
- `server/src/services/authSessionService.ts`
- `server/src/services/companyOnboardingService.ts`
- auth/onboarding tests

### Read-only unless paired with layer owner

- `server/src/models/**`
- `shared/src/**`

## What Good Looks Like

- one clear path per auth state
- no duplicate onboarding routes
- no mixed invite/self-serve forms
- email links point to correct client routes
- verification/reset/invite flows are token-safe
- `/api/auth/me` reflects the user’s real company and permission state
- guards are predictable on refresh and first load

## Mandatory Checks

- unverified login path
- expired verification token
- expired reset token
- duplicate register email
- invite already used
- invite expired
- company create after pending QuickBooks onboarding
- authenticated user without company
- authenticated user with company
- logout and refresh token invalidation

## Anti-Patterns

- mixing invite and self-serve forms
- asking for company data during first account creation when the flow says otherwise
- creating hidden auth state in component-local storage instead of state/service boundaries
- leaving email flows partially implemented
- changing auth response semantics without updating tests and docs

## Required Handoffs

- Backend for controller/route changes
- Frontend for auth and onboarding pages
- Tester for auth matrix and token edge cases
- Release-docs when copy or flow structure changes
