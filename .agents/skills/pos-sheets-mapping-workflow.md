# Skill: POS + Google Sheets Mapping Workflow

## Use This When

The task touches:

- POS import
- Sheets source setup
- Sheets preview
- mapping wizard
- commit/import flow

## Workflow

1. Identify source mode:
   - shared
   - OAuth
2. Confirm source selection semantics.
3. Confirm preview contract and sample/header behavior.
4. Confirm mapping validation path.
5. Confirm commit/import path and duplicate protections.
6. Verify UI messaging for incomplete setup states.

## Must-Check Edge Cases

- OAuth connected but no sheets configured
- shared sheet not shared
- tab not found
- preview returns `columns` instead of `header`
- clicking already-selected sheet/tab
- test/log noise leaking from diagnostics

## Validation

- setup wizard tests
- selector/state tests
- POS import tests
- end-to-end manual path through Settings if route behavior changed

## RetailSync Anti-Patterns

- hardcoding mappings in UI
- letting debug telemetry spam tests
- unclear source-of-truth between shared and OAuth
