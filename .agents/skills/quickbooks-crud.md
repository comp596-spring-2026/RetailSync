# Skill: QuickBooks CRUD

## Use This When

The task touches create/read/update/delete behavior for:

- customers
- vendors
- invoices
- payments
- checks
- expenses
- deposits
- transfers

## Workflow

1. identify the business group:
   - contacts
   - sales
   - money
2. confirm route ownership in QuickBooks workspace
3. confirm backend/integration contract
4. confirm idempotency or duplicate safety
5. confirm detail/list/create/edit/delete pages align

## Must-Check Edge Cases

- missing external ID
- duplicate write retry
- disconnected QuickBooks state
- permission-limited access
- create succeeds but list/detail state is stale

## Validation

- QuickBooks page tests
- relevant backend/integration tests
