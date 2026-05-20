# API Reference

Base URL: `http://localhost:4000/api`

## Response Contract

- success: `{ "status": "ok", "data": ... }`
- error: `{ "status": "error", "message": "...", "details"?: ... }`

## Health

- `GET /health`
- `GET /health/env-readiness`

## Auth

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `POST /auth/verify-email/request`
- `POST /auth/verify-email/confirm`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

## Company / Onboarding

- `POST /company/create`
- `POST /company/join`
- `GET /company/mine`
- `GET /company/quickbooks/onboarding`
- `POST /company/quickbooks/connect`

## Users / Roles / Invites

- `GET /users`
- `PUT /users/:id/role`
- `GET /roles/modules`
- `GET /roles`
- `POST /roles`
- `PUT /roles/:id`
- `DELETE /roles/:id`
- `POST /invites`
- `GET /invites`
- `DELETE /invites/:id`

## POS

- `POST /pos/import`
- `POST /pos/import-file`
- `POST /pos/import-rows`
- `POST /pos/import/sheets/preview`
- `POST /pos/import/sheets/match`
- `POST /pos/import/sheets/commit`
- `POST /pos/clear`
- `GET /pos/daily`
- `GET /pos/daily-paged`
- `GET /pos/overview`
- `GET /pos/export`

## Reports

- `GET /reports/monthly-summary`
- `GET /reports/date-range-summary`

## Accounting Statements

- `POST /accounting/statements/upload-url`
- `POST /accounting/statements`
- `GET /accounting/statements`
- `GET /accounting/statements/:id`
- `GET /accounting/statements/:id/status`
- `GET /accounting/statements/:id/checks`
- `GET /accounting/statements/:id/stream`
- `POST /accounting/statements/:id/reprocess`
- `POST /accounting/statements/:id/checks/:checkId/retry`

## Accounting Legacy/Operational Endpoints

These still exist for pipeline, background processing, or compatibility needs, but they are not part of the primary visible accounting workspace:

- `GET /accounting/ledger/entries`
- `GET /accounting/ledger/entries/:id`
- `PATCH /accounting/ledger/entries/:id`
- `POST /accounting/ledger/entries/:id/approve`
- `POST /accounting/ledger/entries/:id/exclude`
- `POST /accounting/ledger/entries/bulk-approve`
- `POST /accounting/ledger/post-approved`
- `GET /accounting/observability/summary`
- `GET /accounting/observability/debug`

## QuickBooks Integrations

Connection/sync:
- `GET /integrations/quickbooks/oauth-status`
- `GET /integrations/quickbooks/settings`
- `PUT /integrations/quickbooks/settings`
- `GET /integrations/quickbooks/start-url`
- `GET /integrations/quickbooks/start`
- `POST /integrations/quickbooks/disconnect`
- `POST /integrations/quickbooks/sync/refresh-reference-data`
- `POST /integrations/quickbooks/sync/post-approved`
- `POST /integrations/quickbooks/query`

Hub/read surfaces:
- `GET /integrations/quickbooks/hub/chart-of-accounts`
- `GET /integrations/quickbooks/hub/entities`
- `GET /integrations/quickbooks/hub/operations`

Contacts:
- `GET /integrations/quickbooks/contacts/:entityType/:qbId`
- `POST /integrations/quickbooks/contacts/:entityType`
- `PATCH /integrations/quickbooks/contacts/:entityType/:qbId`
- `DELETE /integrations/quickbooks/contacts/:entityType/:qbId`

Money transactions:
- `POST /integrations/quickbooks/money/:txnType`
- `PATCH /integrations/quickbooks/money/:txnType/:qbTxnId`
- `DELETE /integrations/quickbooks/money/:txnType/:qbTxnId`

Write transactions:
- `GET /integrations/quickbooks/write/:txnType`
- `GET /integrations/quickbooks/write/:txnType/:qbTxnId`
- `POST /integrations/quickbooks/write/:txnType`
- `PATCH /integrations/quickbooks/write/:txnType/:qbTxnId`
- `DELETE /integrations/quickbooks/write/:txnType/:qbTxnId`

Tax/live reads:
- `GET /integrations/quickbooks/live/registers/:accountId`
- `GET /integrations/quickbooks/live/transactions/:type`
- `GET /integrations/quickbooks/live/transaction/:qbTxnId`
- `GET /integrations/quickbooks/tax/overview`
- `GET /integrations/quickbooks/tax/reports/:reportKey`
- `GET /integrations/quickbooks/tax/chart-of-accounts`
- `GET /integrations/quickbooks/tax/ledger`
- `GET /integrations/quickbooks/tax/payments`
- `POST /integrations/quickbooks/tax/recover-payment`
- `POST /integrations/quickbooks/tax/journal-adjustment`

## Google / Google Sheets

- `GET /google/connect-url`
- `GET /google/connect`
- `GET /google/callback`
- `GET /sheets/read`
- OAuth and shared Sheets integration endpoints under:
  - `/integrations/google/sheets/*`
  - `/integrations/google-sheets/*`
  - `/integrations/sheets/*`
  - `/settings/google-sheets/*`

### Google Sheets — key routes

| Method | Path | Notes |
|---|---|---|
| `GET` | `/integrations/google/sheets/oauth-status` | Token health + `connectedEmail` |
| `GET` | `/integrations/google/sheets/start-url` | OAuth authorize URL |
| `GET` | `/integrations/google/sheets/callback` | Sets `oauth.connectionStatus`, stores tokens |
| `GET` | `/integrations/google/sheets/files` | OAuth spreadsheet picker |
| `GET` | `/integrations/sheets/shared-files` | Service-account shared drive list |
| `POST` | `/integrations/sheets/tabs` | Tab list (`authMode`: `oauth` \| `service_account`) |
| `POST` | `/settings/google-sheets/shared/verify` | Shared access check; mirrors into canonical profile |
| `POST` | `/settings/google-sheets/stage-change` | Draft connector patch |
| `POST` | `/settings/google-sheets/commit-change` | Persist connector + optional `mappingHash` / `mappingConfirmedAt` |
| `POST` | `/settings/google-sheets/activate` | Set active integration/source/profile |
| `POST` | `/pos/import/sheets/preview` | Header/sample preview |
| `POST` | `/pos/import/sheets/match` | Mapping compatibility; body: `mapping`, `columns`, `transformations` or `transforms` |
| `POST` | `/pos/import/sheets/commit` | Import rows using active or explicit connector |

Connector-first response shape: see [operations/google-sheets-e2e.md](../operations/google-sheets-e2e.md).

## Settings

- `GET /settings` — company settings including **canonical** `googleSheets.oauth` / `googleSheets.shared` (not legacy-only), plus `connected`, `connectedEmail`, `syncSchedule`, and legacy `sharedSheets` when present
- QuickBooks and Google Sheets settings endpoints under `/settings/*`

## Cron / Tasks

- `POST /cron/sync-sheets`
- `POST /cron/accounting-sync`
- `POST /tasks/pipeline`
- `POST /tasks/sync`

## Important Release Note

Unauthenticated debug Sheets endpoints and placeholder generic module CRUD routes are not part of the production API surface in this release line.
