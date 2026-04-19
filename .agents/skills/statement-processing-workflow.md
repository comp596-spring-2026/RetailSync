# Skill: Statement Processing Workflow

## Use This When

The task touches:

- statement upload
- statement month detection
- processing pipeline
- retry/reprocess
- statement detail page

## Workflow

1. Confirm the list page behavior.
2. Confirm upload path and detection behavior.
3. Confirm processing state model and artifact persistence.
4. Confirm detail page presentation of status/artifacts/suggestions.
5. Confirm retry behavior does not duplicate or corrupt results.

## Must-Check Edge Cases

- wrong file type
- drag/drop path
- ambiguous month detection
- failed upload save
- failed processing retry
- empty statements page
- statement detail after partial pipeline completion

## Validation

- UploadStatementDialog tests
- StatementsPage tests
- StatementDetailPage tests
- backend accounting task runner tests when pipeline behavior changes

## RetailSync Anti-Patterns

- exposing stale ledger/reconciliation concepts in visible accounting UI
- unclear retry outcomes
- pipeline changes without artifact/state validation
