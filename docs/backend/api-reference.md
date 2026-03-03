# API Reference

Base URL: `http://localhost:4000/api`

## Response Contract

- Success: `{ "status": "ok", "data": ... }`
- Error: `{ "status": "error", "message": "...", "details"?: ... }`

## Health

- `GET /health`
- `GET /health/env-readiness`

## Auth

- `GET /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Company

- `POST /company/create`
- `POST /company/join`
- `GET /company/mine`

## Roles / RBAC

- `GET /roles/modules`
- `GET /roles`
- `POST /roles`
- `PUT /roles/:id`
- `DELETE /roles/:id`

## Users / Invites

- `GET /users`
- `PUT /users/:id/role`
- `POST /invites`
- `GET /invites`
- `DELETE /invites/:id`

## POS

- `POST /pos/import` (multipart `file`)
- `POST /pos/import-file` (multipart `file`)
- `POST /pos/import-rows` (JSON rows)
- `POST /pos/import/sheets/preview`
- `POST /pos/import/sheets/match`
- `POST /pos/import/sheets/commit`
- `POST /pos/import/google-sheets` (alias to commit flow)
- `POST /pos/clear`
- `GET /pos/daily?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /pos/daily-paged?start&end&page&limit`
- `GET /pos/overview?start&end`
- `GET /pos/export?start&end` (CSV download)

## Reports (API still available)

- `GET /reports/monthly-summary?month=YYYY-MM`
- `GET /reports/date-range-summary?start=YYYY-MM-DD&end=YYYY-MM-DD`

## Inventory

Items:

- `GET /inventory/items`
- `POST /inventory/items`
- `PUT /inventory/items/:id`
- `DELETE /inventory/items/:id`
- `POST /inventory/items/import` (multipart `file`)

Locations:

- `GET /inventory/locations`
- `POST /inventory/locations`
- `PUT /inventory/locations/:id`
- `DELETE /inventory/locations/:id`

Operations:

- `POST /inventory/move`
- `GET /inventory/location/:code`

## Integrations: Google + Sheets

Google helper routes:

- `GET /google/connect-url`
- `GET /google/connect`
- `GET /google/callback`

Sheets read helper:

- `GET /sheets/read?spreadsheetId=...&range=...`

Google Sheets integration (OAuth-specific):

- `GET /integrations/google/sheets/oauth-status`
  - Returns: `{ ok, reason, email, scopes, expiresInSec }`
- `GET /integrations/google/sheets/start-url`
- `GET /integrations/google/sheets/files`
- `GET /integrations/google/sheets/start`
- `GET /integrations/google/sheets/callback`

Shared/service-account sheets integration:

- `GET /integrations/sheets/shared-files`
- `POST /integrations/sheets/config`
- `POST /integrations/sheets/verify`
- `GET /integrations/sheets/tabs`
- `POST /integrations/sheets/tabs`
- `POST /integrations/sheets/save-mapping`
- `POST /integrations/sheets/sync-schedule`
- `POST /integrations/sheets/delete-source`
- `POST /integrations/sheets/oauth/debug`
- `POST /integrations/sheets/shared/debug`

Connector-first settings endpoints (preferred):

- `POST /settings/google-sheets/activate`
- `GET /settings/google-sheets/oauth/sources`
- `POST /settings/google-sheets/oauth/sources`
- `PUT /settings/google-sheets/oauth/sources/:sourceId/connectors/:connectorKey`
- `GET /settings/google-sheets/shared/profiles`
- `POST /settings/google-sheets/shared/profiles`
- `PUT /settings/google-sheets/shared/profiles/:profileId/connectors/:connectorKey`
- `POST /settings/google-sheets/stage-change`
- `POST /settings/google-sheets/commit-change`

Legacy-compatible settings endpoints (still present):

- `PUT /settings/google-sheets/mode`
- `PUT /settings/google-sheets/source`
- `POST /settings/google-sheets/test`
- `POST /settings/google-sheets/reset`
- `POST /settings/google-sheets/shared/verify`

POS Google Sheets runtime flow:

1. Configure connector in Settings (OAuth or Shared) using connector-first endpoints.
2. Optional validation:
   - `POST /pos/import/sheets/preview`
   - `POST /pos/import/sheets/match`
3. Import / sync:
   - `POST /pos/import/sheets/commit`
   - Body can include explicit ref:
     - `{ connectorKey, integrationType: "oauth", sourceId }`
     - `{ connectorKey, integrationType: "shared", profileId }`
   - Or omit ref to use active integration + active connector from settings.

Debug endpoints:

- `GET /debug/sheets/read`
- `POST /debug/sheets/append`

## Settings

- `GET /settings`
- `POST /settings/google-sheets/activate`
- `GET /settings/google-sheets/oauth/sources`
- `POST /settings/google-sheets/oauth/sources`
- `PUT /settings/google-sheets/oauth/sources/:sourceId/connectors/:connectorKey`
- `GET /settings/google-sheets/shared/profiles`
- `POST /settings/google-sheets/shared/profiles`
- `PUT /settings/google-sheets/shared/profiles/:profileId/connectors/:connectorKey`
- `POST /settings/google-sheets/stage-change`
- `POST /settings/google-sheets/commit-change`
- `GET /settings/google-sheets/sync-overview`
- `POST /settings/google-sheets/test`
- `PUT /settings/google-sheets/mode`
- `PUT /settings/google-sheets/source`
- `POST /settings/google-sheets/reset`
- `POST /settings/disconnect/google`
- `POST /settings/quickbooks/connect`
- `PUT /settings/quickbooks`
- `POST /settings/disconnect/quickbooks`

## Cron

- `POST /cron/sync-sheets` (expects `x-cron-secret` when configured)

## Module Shell CRUD (placeholder)

Available under `/api/<module>` for shell-backed modules:

- `GET /<module>`
- `POST /<module>`
- `PUT /<module>/:id`
- `DELETE /<module>/:id`

Current registered modules:

- `inventory`, `invoices`, `pos`, `items`, `bankStatements`, `reconciliation`, `locations`, `suppliers`, `reports`, `dashboard`
