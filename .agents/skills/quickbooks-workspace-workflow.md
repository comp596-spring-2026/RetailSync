# Skill: QuickBooks Workspace Workflow

## Use This When

The task touches:

- QuickBooks hub
- accounts
- contacts
- sales
- money
- operations
- reports
- tax
- QuickBooks onboarding connection

## Workflow

1. Confirm the current workspace grouping.
2. Place the change in the correct group:
   - accounts
   - contacts
   - sales
   - money
   - operations
   - reports
   - tax
3. Confirm whether the change is:
   - CRUD
   - status/audit
   - read-only reporting
   - connection/onboarding
4. Confirm route ownership stays inside QuickBooks.
5. Confirm provider-safe write/idempotency behavior.

## Must-Check Edge Cases

- disconnected connection state
- reconnect path
- missing external ID
- duplicate write retry
- role without QuickBooks access
- hub path vs child page back navigation

## Validation

- QuickBooks page tests
- service/controller tests for changed provider behavior
- routing sanity if page grouping changes

## RetailSync Anti-Patterns

- collapsing QuickBooks back into accounting
- mixing operations with CRUD without explanation
- exposing only read flows while hiding create/edit/delete paths
