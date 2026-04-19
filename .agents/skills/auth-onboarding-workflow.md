# Skill: Auth & Onboarding Workflow

## Use This When

The task touches:

- register/login/logout
- verify email
- forgot/reset password
- invite acceptance
- onboarding guards
- company create/join
- QuickBooks-assisted onboarding

## Workflow

1. Identify which entry flow is being changed:
   - self-serve
   - invite
   - reset/verify
   - onboarding/company
2. Confirm the canonical route and current redirect target.
3. Confirm the server contract:
   - request payload
   - response envelope
   - error semantics
4. Confirm email/token behavior.
5. Update UI, backend, and tests in lockstep.
6. Update docs if visible copy or route behavior changed.

## Must-Check Edge Cases

- login before verification
- expired verification token
- expired reset token
- already-used invite
- user without company
- user with company
- QuickBooks onboarding pending but no company yet

## Validation

- auth page tests
- backend auth tests
- `/api/auth/me` consistency
- onboarding guard tests

## RetailSync Anti-Patterns

- mixing invite fields into generic register
- asking for company data too early
- route drift between email links and actual pages
- changing auth semantics without updating tests
