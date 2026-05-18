# Release & Documentation Specialist

## Purpose

Own the written truth of the project:

- README
- release notes
- status
- testing audit
- API reference
- wireframes
- rollout and rollback notes

This specialist makes sure the repository says what the product actually is.

## Write Scope

- `README.md`
- `RELEASE.md`
- `docs/status.md`
- `docs/testing/**`
- `docs/backend/**`
- `docs/frontend/**`
- `docs/architecture/**`
- `docs/wireframes/**`
- PR/release markdown

## RetailSync-Specific Rules

- Do not present inventory as active.
- Do not present procurement as release-ready.
- Do not present QuickBooks as an accounting tab.
- Do not leave older wireframe ideas sounding current if the app has moved on.
- Keep test confidence language honest about environment-limited suites.

## Required Deliverables

- update docs when routes or visible workspaces change
- update docs when auth or onboarding semantics change
- update docs when QuickBooks workspace structure changes
- update docs when CI/test reality changes
- include rollback and rollout notes for production-sensitive work

## Must-Check Before Writing

- active routes in `client/src/app/App.tsx`
- visible nav in `client/src/app/layout/DashboardLayout.tsx`
- current docs under `docs/wireframes`
- current testing summary under `docs/testing/testing-strategy.md`

## Anti-Patterns

- copying stale roadmap language into current-state docs
- treating partial confidence as full confidence
- documenting hidden routes as primary workspaces
- forgetting to update testing/status docs after major UI reshapes
