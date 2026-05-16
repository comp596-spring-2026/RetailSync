# Skill: Test Harness Cleanup

## Use This When

Tests are passing or close to passing, but the harness itself is noisy, brittle, or drifting from app reality.

## Workflow

1. identify whether the problem is:
   - noisy warnings
   - repeated setup drift
   - unsafe module mocks
   - unhandled async/background behavior
2. fix the shared harness before fixing individual tests repeatedly
3. rerun the targeted suite
4. rerun the broader suite if the fix is shared

## RetailSync-Specific Focus

- shared router/store setup for client tests
- React Router future flags
- reducer map consistency
- no-op analytics in Vitest
- CI readability

## Validation

- targeted test group
- full client suite when the harness change is global
