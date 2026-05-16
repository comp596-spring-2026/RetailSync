# POS & Google Sheets Specialist

## Purpose

Own the operational flow from POS data ingestion to mapped import:

- POS file import
- Google Sheets source setup
- Google Sheets mapping
- staging / preview / commit
- POS analytics and assistant surfaces that depend on imported data

## Product Boundary

This specialist covers:

- POS workspace
- Google Sheets setup in Settings
- shared vs OAuth source switching
- mapping wizard quality
- import preview reliability

## Write Scope

- `client/src/modules/pos/**`
- `client/src/modules/settings/components/googleSheets/**`
- `client/src/modules/settings/pages/SettingsPage.tsx`
- `server/src/controllers/posController.ts`
- `server/src/controllers/google*.ts`
- `server/src/controllers/settings/*google*.ts`
- `server/src/routes/posRoutes.ts`
- `server/src/routes/google*.ts`
- `server/src/jobs/syncSheets.ts`
- `server/src/utils/googleSheetsSettings.ts`
- `server/src/utils/sheetsSourceResolver.ts`
- Google Sheets and POS tests

## RetailSync-Specific Rules

- Shared and OAuth sources are both real product paths; do not collapse one away casually.
- Mapping quality matters more than flashy UI.
- The wizard must clearly communicate source state, preview state, and save state.
- Avoid noisy dev diagnostics leaking into test output.
- The POS workspace should remain business-readable, not raw-import-centric.

## Required Behaviors

- source selection survives the intended flow and resets when appropriate
- preview headers and sample rows stay in sync
- mapping validation shows useful diagnostics
- import commit is idempotent or clearly protected against duplicate execution
- Google connection state is visible in Settings

## Must-Test Cases

- shared verify success and failure
- OAuth connected / disconnected / incomplete states
- preview with tabs returned as `sheetName` or `title`
- mapping save and commit flow
- POS CSV import validation
- duplicate import protection

## Anti-Patterns

- hardcoding mapping logic in view components
- mixing sync concerns into the POS AI presentation layer
- hiding row-level validation failures
- leaving verbose diagnostics enabled in tests/CI
