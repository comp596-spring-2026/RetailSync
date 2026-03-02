# Google Sheets Integration: End-to-End Flow Charts, Buttons, Paths, and Gaps

This document captures all known user-visible and backend paths for Google Sheets integration in RetailSync, including:

- OAuth sheet integration flow
- Shared sheet profiles flow (multiple named sheets like `POS Data SHEET`, `EFT SHEET`)
- POS import modal workflow
- Sync workflows (manual sync, import commit, cron sync)
- Debug workflow (step-by-step checks)
- Coverage matrix and missing scenarios

---

## 1) Top-Level System Flow

```mermaid
flowchart TD
  A["User opens Settings > Integrations > Google Sheets"] --> B{"Mode selected"}
  B -->|"OAuth"| C["Connect OAuth / select OAuth source"]
  B -->|"Shared"| D["Manage sharedSheets[] profiles"]

  C --> E["Configure sheet + mapping"]
  D --> E

  E --> F["Verify access (tabs + preview)"]
  F --> G["Save mapping"]
  G --> H["POS import/sync ready"]

  H --> I["Manual: POS page > Sync from Sheets"]
  H --> J["Manual: POS import modal > Commit import"]
  H --> K["Scheduled: /api/cron/sync-sheets"]

  I --> L["Import pipeline: read -> map -> validate -> upsert"]
  J --> L
  K --> L
  L --> M["POSDailySummary updated + IntegrationSettings lastImportAt/source"]
```

---

## 2) Settings UI Button Map and Behavior

### Google Sheets Card Buttons

| Button | Location | Action |
|---|---|---|
| `Sync now` | Google Sheets card header | Triggers immediate sync from configured/default profile |
| `Reset integration` | Google Sheets card header | Clears Google integration state |
| `Debug` | OAuth block and Shared block | Runs step-by-step diagnostics |
| `Verify access` | OAuth block and Shared block | Calls verify endpoint for selected/default profile |
| `Check connection` | OAuth block | Re-check OAuth token status |
| `Disconnect` | OAuth block | Disconnects OAuth linkage |
| `Use this mode` | OAuth/Shared block when inactive | Switches active mode |
| `Change sheet` | Setup inline | Opens files list and allows selecting another sheet |
| `Save mapping` | Setup inline mapping step | Validates and stores mapping |
| `New profile` | Shared setup inline | Starts creating new shared profile name |

---

## 3) OAuth Flow

```mermaid
flowchart TD
  A["User selects OAuth mode"] --> B["GET /api/integrations/google/sheets/start-url"]
  B --> C["Google consent"]
  C --> D["/api/integrations/google/sheets/callback"]
  D --> E["Store OAuth tokens + mark googleSheets.connected=true"]
  E --> F["User selects OAuth spreadsheet (source)"]
  F --> G["Preview tab: /api/pos/import/sheets/preview source=oauth"]
  G --> H["Validate mapping: /api/pos/import/sheets/match"]
  H --> I["Commit: /api/pos/import/sheets/commit options.spreadsheetId"]
  I --> J["Upsert POS rows + update integration timestamps"]
```

### OAuth Debug Steps

```mermaid
flowchart TD
  O1["Check OAuth token"] --> O2["Resolve active OAuth spreadsheet"]
  O2 --> O3["List tabs"]
  O3 --> O4["Read preview rows"]
  O4 --> O5["Validate required mapped fields"]
```

---

## 4) Shared Profiles Flow (`sharedSheets[]`)

```mermaid
flowchart TD
  A["User opens Shared mode"] --> B["Create/Edit profile (name + spreadsheetId + tab + headerRow)"]
  B --> C["POST /api/integrations/sheets/config"]
  C --> D["upsert sharedSheets[] profile"]
  D --> E["Mirror default profile into legacy sharedConfig (compatibility)"]
  E --> F["Save mapping for profile"]
  F --> G["POST /api/integrations/sheets/save-mapping mode=service_account + profileId"]
  G --> H["Verify profile access"]
  H --> I["POST /api/integrations/sheets/verify { profileId }"]
  I --> J["Profile ready for Sync/Import/Cron"]
```

### Shared Debug Steps

```mermaid
flowchart TD
  S1["Resolve default shared profile"] --> S2["Verify shared sheet access"]
  S2 --> S3["List tabs"]
  S3 --> S4["Read preview rows"]
  S4 --> S5["Validate required mapped fields"]
```

---

## 5) POS Import Modal Flow

```mermaid
flowchart TD
  A["POS > Import Data"] --> B{"Source"}
  B -->|"File"| C["Upload -> Confirm -> Commit"]
  B -->|"Google Sheets"| D{"Configured?"}

  D -->|"No"| E["Connect -> Pick Sheet -> Tabs -> Mapping -> Confirm"]
  D -->|"Yes"| F["Google Ready: Import now / Change Sheet"]

  E --> G["/api/pos/import/sheets/preview + match + save-mapping + commit"]
  F --> H["/api/pos/import/sheets/commit with saved mapping"]
  G --> I["Upsert POS rows"]
  H --> I
```

---

## 6) Sync Workflows and Continuity

### Manual Sync Button Flow

```mermaid
flowchart TD
  A["User clicks Sync from Sheets"] --> B["Confirm dialog"]
  B --> C["Start sync progress UI"]
  C --> D["POST /api/pos/import/sheets/commit (saved mapping path)"]
  D --> E["Upsert result: imported/upserted/modified"]
  E --> F["Refresh POS daily table + show summary snackbar"]
```

### Cron Sync Flow

```mermaid
flowchart TD
  A["POST /api/cron/sync-sheets"] --> B["Acquire job lock"]
  B --> C["Find configured companies"]
  C --> D["Read default shared profile sheet"]
  D --> E["Load saved mapping from profile"]
  E --> F["Map + importRowsForCompany upsert"]
  F --> G["Update settings lastImportAt/source"]
  G --> H["Release lock + return result"]
```

### Continuity Guarantees (Current)

- Repeated imports use upsert semantics by date.
- Existing dates are updated, new dates are inserted.
- Integration `lastImportAt` and `lastImportSource` are refreshed after successful import.

---

## 7) Coverage Matrix (E2E/API)

Implemented in: [sheetsIntegration.e2e.test.ts](/Users/trupal/Projects/RetailSync/server/src/sheetsIntegration.e2e.test.ts)

| Scenario | Covered |
|---|---|
| Multi shared profiles can be created (`POS Data SHEET`, `EFT SHEET`) | Yes |
| Save mapping on shared profile and commit with saved mapping | Yes |
| Shared import continuity across repeated sync/upsert | Yes |
| OAuth mode import with explicit spreadsheet override | Yes |
| Cron sync imports from default shared profile | Yes |

---

## 8) Missing or Weak Spots

These are the current gaps discovered while mapping all paths:

1. No explicit `Set Default Profile` button in Shared UI.
2. No `Delete Profile` path for `sharedSheets[]` entries.
3. Sync progress UI is client-estimated, not server job progress.
4. No dedicated import job status endpoint for long-running visibility/retry.
5. OAuth and Shared mappings are still partially intertwined in some fallback paths (compatibility layer remains).
6. No strict profile-type gating for non-POS profiles (for example, EFT profile still can be selected where POS schema is expected).
7. No full browser-level Playwright/Cypress scenario coverage yet (current tests are API e2e with mocked Google APIs).

---

## 9) Recommended Next Steps

1. Add backend endpoints and UI for profile default selection and profile deletion.
2. Add job progress endpoint and wire progress bar to real server state.
3. Add profile `domain/type` field (for example `pos`, `eft`) and enforce compatibility in import flows.
4. Add browser E2E suite for UI actions: connect, configure, debug, sync, change profile, and continuity checks.
