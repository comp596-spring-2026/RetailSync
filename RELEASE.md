# RetailSync Release Flow

## Branches

- `development`: active work and QA validation.
- `production`: protected branch for deployments.

## Required Rules for `production`

- Require at least 1 PR review.
- Require status checks from CI to pass.
- Restrict direct pushes.
- Prefer squash or rebase merge.

## Release Checklist

1. Merge feature PRs into `development`.
2. Run QA on `development`.
3. Open PR from `development` to `production`.
4. Ensure `ci.yml` passes.
5. Get required approvals.
6. Merge PR; `deploy.yml` runs automatically.
7. Confirm smoke checks:
   - `GET /health`
   - Sheets tabs/preview path for a valid company.
