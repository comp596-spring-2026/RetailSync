# API Reference

Base URL: `http://localhost:4000/api`

## Response Contract

- success: `{ "status": "ok", "data": ... }`
- error: `{ "status": "error", "message": "...", "details"?: ... }`

## Auth Endpoints

### `GET /auth/google/start`
Starts Google OAuth authorization.

### `GET /auth/google/callback`
Handles Google OAuth callback and redirects client with `accessToken`.

### `POST /auth/refresh`
### `POST /auth/logout`
### `GET /auth/me`

## Company Onboarding

- `POST /company/create`
- `POST /company/join`
- `GET /company/mine`

## RBAC Roles

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

## POS and Reports

- `POST /pos/import` (multipart `file`)
- `POST /pos/import-file` (multipart `file`)
- `POST /pos/import-rows` (JSON rows)
- `GET /pos/daily?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /reports/monthly-summary?month=YYYY-MM`

## Items, Locations, Inventory

- `GET /inventory/items`
- `POST /inventory/items`
- `PUT /inventory/items/:id`
- `DELETE /inventory/items/:id`
- `POST /inventory/items/import` (multipart `file`)

- `GET /inventory/locations`
- `POST /inventory/locations`
- `PUT /inventory/locations/:id`
- `DELETE /inventory/locations/:id`

- `POST /inventory/move`
- `GET /inventory/location/:code`

## Google / Sheets Integrations

- `GET /google/connect-url` (auth required, returns OAuth URL)
- `GET /google/connect` (placeholder/public flow depending on route config)
- `GET /google/callback`
- `GET /sheets/read?spreadsheetId=...&range=...`

## Integration Settings

- `GET /settings/`
- `POST /settings/google-sheets/test`
- `PUT /settings/google-sheets/mode`
- `PUT /settings/google-sheets/source`
- `POST /settings/quickbooks/connect`
- `PUT /settings/quickbooks`
- `POST /settings/disconnect/google`
- `POST /settings/disconnect/quickbooks`

## Placeholder CRUD Shell Endpoints

Also available under `/api/<module>` for generic module shells:

- `GET /<module>`
- `POST /<module>`
- `PUT /<module>/:id`
- `DELETE /<module>/:id`

## Workflow: Auth and Session

```mermaid
flowchart TD
  A["Login with Google"] --> B["/auth/google/start"]
  B --> C["Google consent + callback"]
  C --> D["Issue access + refresh tokens"]
  D --> E["Refresh rotates token"]
  E --> F["Logout revokes token"]
```

## Workflow: Google Sheets Import

```mermaid
flowchart TD
  A["Import POS Data modal"] --> B["Select source (File / Google Sheets / POS DB)"]
  B --> C["If Google Sheets: Connect (OAuth or Service Account)"]
  C --> D["List tabs (/integrations/sheets/tabs or Drive files)"]
  D --> E["Preview sheet (/pos/import/sheets/preview)"]
  E --> F["Match columns (/pos/import/sheets/match)"]
  F --> G["Commit import (/pos/import/sheets/commit)"]
```

## Permission Matrix by Endpoint (Current)

```mermaid
flowchart TD
  A[/pos/import or pos/import-file/] --> P1[pos:create + pos:import]
  B[/pos/daily/] --> P2[pos:view]
  C[/reports/monthly-summary/] --> P3[reports:view]

  D[/inventory/items/import/] --> P4[items:create + items:import]
  E[/inventory/items CRUD/] --> P5[items:view/create/edit/delete]
  F[/inventory/locations CRUD/] --> P6[locations:view/create/edit/delete]
  G[/inventory/move/] --> P7[inventory:edit + inventory:move]
  H[/inventory/location/:code/] --> P8[inventory:view]
```
