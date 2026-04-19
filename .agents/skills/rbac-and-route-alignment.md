# Skill: RBAC And Route Alignment

## Use This When

The task touches:

- users
- roles
- invites
- nav visibility
- protected routes
- permission matrix

## Workflow

1. Identify the current visible workspace structure.
2. Map that structure to module keys and actions.
3. Check server permission enforcement.
4. Check client nav and guarded routes.
5. Update role/editor presentation only after confirming backend reality.

## Must-Check Edge Cases

- hidden module still in role matrix
- direct URL on hidden page
- role assignment after login
- stale nav labels after route changes
- invite role selection drift

## Validation

- role UI tests
- guard tests
- permission middleware tests if behavior changed
- route alias behavior if relevant

## RetailSync Anti-Patterns

- current nav and role matrix showing different products
- UI-only enforcement
- stale hidden modules shown as if they are current
