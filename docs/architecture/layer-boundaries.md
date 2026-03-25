# RetailSync Layer Boundaries

Date: 2026-03-25

## Purpose

This document is the concise rulebook for cleanup execution.

Use it when scoping tasks, assigning file ownership, and validating handoffs.

## Boundary Summary

### Frontend

`app`

- owns shell composition only
- may import module public APIs
- must not own feature workflows

`components`

- owns reusable presentational UI only
- must not wrap module-specific compatibility exports

`modules`

- own their feature pages, state, hooks, api wrappers, and module-specific workflow helpers
- must not import other module internals

### Backend

`routes`

- register endpoints and middleware only

`controllers`

- translate HTTP requests into application calls
- must stay thin
- must not call sibling controllers

`application`

- owns use-case orchestration
- is the required seam between transport and domain/integration work

`services`

- own reusable business logic

`integrations`

- own Google and QuickBooks adapters
- own provider-specific normalization and auth helpers

`repositories`

- own persistence access

`jobs`

- own scheduled and async entrypoints
- must invoke application/services, never controllers

## Canonical Import Rules

Allowed:

- controller -> application
- application -> service/repository/integration
- service -> repository/integration
- job -> application/service/repository/integration
- module page -> module component/hook/api/state
- shared component -> shared component/util only

Forbidden:

- controller -> controller
- job -> controller
- route -> model
- settings module -> POS module internals
- POS module -> settings module internals
- shared component -> module internals

## Canonical Route Ownership

Use one route family per provider concern.

Google:

- `/api/integrations/google/*`

QuickBooks:

- `/api/integrations/quickbooks/*`

Settings:

- `/api/settings/*`

Debug:

- `/api/debug/*`

Rules:

- do not add alternate Google Sheets route families
- deprecations must be explicit and temporary
- provider callbacks, sync, and debug operations belong under `integrations`, not `settings`

## Missing Layers To Add During Cleanup

- `server/src/application/*`
- `server/src/repositories/*`
- module-local frontend workflow hooks/helpers where large pages currently mix view logic and orchestration

## Validation Checklist

Before a task is marked validated:

- file ownership matches the task card
- no new forbidden imports were introduced
- route ownership stays canonical
- no provider-specific logic leaked back into `utils`
- no module-specific UI leaked back into shared `components`
