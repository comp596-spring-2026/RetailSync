# Skill: Release Readiness Workflow

## Use This When

The task touches:

- production hardening
- release notes
- PR summaries
- test confidence
- docs/status updates
- rollout/rollback communication

## Workflow

1. Confirm current visible product shape.
2. Confirm what changed in routes/workspaces/contracts.
3. Confirm build and test status.
4. Distinguish:
   - passed
   - partially verified
   - environment-limited
5. Update README, release docs, status docs, and wireframes as needed.

## Must-Check Edge Cases

- docs still mentioning retired inventory
- docs still treating procurement as release-ready
- docs still presenting QuickBooks as an accounting tab
- test logs green but with hidden unhandled errors
- PR text overstating confidence

## Validation

- typecheck/build status
- targeted test status
- docs consistency pass

## RetailSync Anti-Patterns

- optimistic release language
- stale wireframes treated as current
- hiding known environment limits in test reporting
