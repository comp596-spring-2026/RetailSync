# Google Sheets Configuration E2E (POS)

This runbook documents the current connector-first Google Sheets flow used by Settings, POS import, and POS Sync.

## 1) Source of truth

Google Sheets settings are canonical under `GET /api/settings`:

- `googleSheets.activeIntegration`
- `googleSheets.oauth.sources[].connectors[]`
- `googleSheets.shared.profiles[].connectors[]`
- active refs:
  - `googleSheets.oauth.activeSourceId`
  - `googleSheets.shared.activeProfileId`
  - `googleSheets.oauth.activeConnectorKey`
  - `googleSheets.shared.activeConnectorKey`

For POS import/sync, active connector key is `pos_daily` unless explicitly overridden.

## 2) UI ownership rules

- Google Sheets setup is owned by **Settings -> Google Sheets**.
- POS Import modal does not run a separate Google sheet mapping flow.
- From POS Import modal, selecting **Google Sheets** routes user to Settings setup.
- POS page **Sync Now** executes import using saved connector config.

## 3) Connector lifecycle

States are determined from connector payload quality:

1. `not_configured`: missing connector or missing `spreadsheetId/sheetName/mapping`
2. `invalid`: mapping fails required-target or duplicate-target checks
3. `needs_review`: valid mapping but not confirmed hash/timestamp
4. `ready`: valid + confirmed mapping

## 4) Setup flow (Settings)

### Step 1: Select source and connect

OAuth path:

1. `GET /api/integrations/google/sheets/oauth-status`
2. `GET /api/integrations/google/sheets/start-url`
3. Redirect to Google, then callback:
   - `GET /api/integrations/google/sheets/callback`

Shared path:

1. Share sheet with service account email
2. Verify access:
   - `POST /api/settings/google-sheets/shared/verify`

### Step 2: Pick spreadsheet + tab + preview

OAuth:

- `GET /api/integrations/google/sheets/files`
- `POST /api/integrations/sheets/tabs` with `{ spreadsheetId, authMode: "oauth" }`

Shared:

- `GET /api/integrations/sheets/shared-files`
- `POST /api/integrations/sheets/tabs` with `{ spreadsheetId, authMode: "service_account" }`

Preview/match:

- `POST /api/pos/import/sheets/preview`
- `POST /api/pos/import/sheets/match`

### Step 3: Persist connector config

Preferred connector-first write path:

1. `POST /api/settings/google-sheets/stage-change`
2. `POST /api/settings/google-sheets/commit-change`
3. (optional explicit activation) `POST /api/settings/google-sheets/activate`

`commit-change` persists connector fields including:

- `spreadsheetId`
- `spreadsheetTitle` (if available)
- `sheetName`
- `headerRow`
- `mapping`
- `transformations`
- `mappingConfirmedAt`
- `mappingHash`

## 5) POS import and sync execution

Runtime import endpoint:

- `POST /api/pos/import/sheets/commit`

Supported request styles:

1. Explicit connector ref:
   - `{ connectorKey, integrationType: "oauth", sourceId }`
   - `{ connectorKey, integrationType: "shared", profileId }`
2. Active-resolution mode:
   - `{ connectorKey }`
   - or empty body (server resolves active integration + active connector)

Server performs:

1. resolve active/explicit connector config
2. read rows from configured spreadsheet + tab
3. validate mapping compatibility
4. evaluate derived fields
5. bulk upsert POS rows by `(companyId, date)`
6. update connector/integration last import timestamps

## 6) POS page Sync Now behavior

POS `Sync Now` uses a resilient client strategy:

1. Try canonical settings parse (`activeIntegration` + active source/profile + connector).
2. Fallback to legacy shape if present.
3. If settings parse is unavailable/stale, still call commit endpoint with `{ connectorKey: "pos_daily" }` and let server resolve active config.

This prevents false local errors such as:

- `No saved sheet mapping found. Configure mapping first.`

when canonical connector is actually configured.

## 7) Required POS mapping targets

Required targets:

- `date`
- `highTax`
- `lowTax`
- `saleTax`
- `gas`
- `lottery`
- `creditCard`
- `lotteryPayout`

Optional:

- `cashExpenses`
- `notes`

## 8) Reset behavior

Endpoint:

- `POST /api/settings/google-sheets/reset`

Modes:

- soft reset: remove integration config, keep imported rows
- hard reset: remove integration config and delete Google-sourced POS rows

## 9) Common errors and meaning

- `Connector not configured: pos_daily`
  - Active integration/profile/source exists but connector is missing or incomplete.
- `IntegrationSettings validation failed ... spreadsheetId is required`
  - Connector write attempted without `spreadsheetId`.
- `Selected tab was not found`
  - Provided `sheetName/tab` does not exist in selected spreadsheet.
- `Row N (sheet row M): Required target ... is missing`
  - Required mapped value empty for that data row.
- `Derived field ... produced invalid numeric value`
  - Derived expression evaluated to non-numeric for numeric field.

## 10) Regression checklist

1. Configure Shared connector and save mapping.
2. Confirm `GET /api/settings` shows:
   - `activeIntegration = "shared"`
   - `shared.activeProfileId`
   - `shared.activeConnectorKey = "pos_daily"`
   - matching connector with `spreadsheetId/sheetName/mapping`.
3. Run POS `Sync Now` and verify import succeeds.
4. Open POS Import modal -> choose Google Sheets -> confirm it routes to Settings (no duplicate mapping flow).
5. Re-run `Sync Now` and verify upsert continuity (same dates update, no duplicates).
