# Skill: Tenant-Safe Backend Change

## Use This When

Backend work touches:

- tenant-bound queries
- permission checks
- auth/session context
- integration actions bound to company context

## Workflow

1. identify company-bound entities
2. verify query scoping
3. verify permission middleware
4. verify auth context assumptions
5. verify tests cover unauthorized and cross-tenant scenarios

## Must-Check Edge Cases

- unscoped `findOne`
- role lookup before tenant context is ready
- direct URL access with insufficient permission
- onboarding/auth path with missing company

## Validation

- controller/service tests
- permission/tenant edge case checks
