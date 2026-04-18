# RetailSync Release Flow

## Branch Model

- `development`: active integration branch
- `production`: protected deployment branch

## Release Expectations

Before opening a production PR:

1. Confirm the active product docs are current.
2. Confirm the release blockers are removed or explicitly deferred.
3. Run the strongest available validation:
   - `pnpm -r typecheck`
   - `pnpm -r build`
   - `pnpm -r test`
4. Manually smoke the critical user journeys:
   - register, verify, login
   - forgot/reset password
   - accept invite
   - create company / join company
   - POS import and view switching
   - statements list/detail
   - QuickBooks hub and CRUD workflows
   - settings connect/disconnect flows

## Required Rules For `production`

- require PR review
- require CI to pass
- no direct pushes
- prefer squash merge unless a release branch history must be preserved

## Production PR Checklist

- docs updated
- release notes or PR summary included
- no exposed debug-only endpoints
- no placeholder production APIs in the active backend surface
- no stale inventory references in current product docs
- smoke validation recorded in the PR body

## Deployment

1. Merge PR into `production`.
2. Let `.github/workflows/deploy.yml` run.
3. Confirm:
   - `GET /health`
   - frontend loads
   - auth bootstrap works
   - QuickBooks workspace opens
   - statements workspace opens
