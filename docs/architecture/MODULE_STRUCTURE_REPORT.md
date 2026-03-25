# RetailSync Module Structure Report

Date: 2026-03-25

## Purpose

This document is the manager-owned canonical map for cleanup planning.

It defines:

- the approved top-level structure
- layer ownership
- route ownership
- forbidden cross-layer dependencies
- the cleanup targets that downstream agents must preserve

This report supersedes older ad hoc structure notes where they conflict.

## Canonical Topology

```text
repo/
  client/
    src/
      app/                 # app shell only
      components/          # shared presentational UI only
      modules/             # feature-owned UI, state, hooks, api wrappers
      hooks/               # client-wide hooks
      layout/              # shared layout shells
      constants/           # client-only constants
      utils/               # client-only helpers
      lib/                 # client-only cross-cutting code
      types/               # client-only types
  server/
    src/
      app.ts               # express composition root
      routes/              # route registration only
      controllers/         # HTTP adapters only
      application/         # use-case orchestration
      services/            # domain services
      integrations/        # provider adapters
      repositories/        # persistence access
      models/              # mongoose models
      middleware/          # express middleware
      jobs/                # scheduled / async entrypoints
      utils/               # truly shared server helpers only
      config/              # env and runtime config
  shared/
    src/                   # source-only shared contracts
```

## Frontend Ownership

### `client/src/app`

Owns:

- app bootstrap
- router composition
- providers
- store infrastructure
- auth/session bootstrap helpers
- route guards

Must not own:

- feature business logic
- feature-specific workflow state
- feature-specific mapping logic

### `client/src/components`

Owns:

- reusable presentational UI
- app-wide visual primitives
- shared layout widgets

Must not own:

- feature workflows
- feature API calls
- feature Redux state
- module-specific compatibility shims

Rule:

- if a component only exists for one module, it belongs under `client/src/modules/<module>/components`

### `client/src/modules/<module>`

Owns:

- module pages
- module-only components
- module API wrappers
- module state
- module hooks
- module view-model / workflow helpers

Rules:

- modules may depend on `app`, `components`, `layout`, `hooks`, `lib`, `utils`, `constants`, `types`, and `@retailsync/shared`
- modules must not import page, component, or state internals from other modules
- cross-module collaboration must happen through:
  - backend contracts
  - shared package contracts
  - narrow public module exports explicitly intended for reuse

### Current Cleanup Targets

- remove module-owned UI mirrored through `client/src/components/*`
- move workflow logic out of oversized pages/components into module hooks or module-local helpers
- prevent `settings` from importing `pos` or `accounting` internals
- prevent `pos` from importing `settings` internals

## Backend Ownership

### `server/src/routes`

Owns:

- route declarations
- middleware composition
- binding route handlers to controllers

Must not own:

- business logic
- provider logic
- persistence logic

### `server/src/controllers`

Owns:

- request validation entrypoint
- HTTP request/response translation
- invoking application services
- mapping domain results to transport responses

Must not own:

- long-running orchestration
- direct provider workflows
- cross-controller reuse
- job logic

Rule:

- controllers must never import other controllers

### `server/src/application`

Owns:

- use-case orchestration
- transaction boundaries
- multi-step workflows
- coordination across repositories, services, and integrations

This is a required missing layer to introduce during cleanup.

### `server/src/services`

Owns:

- domain logic reusable across entrypoints
- pure business operations

Must not own:

- Express request/response concerns
- provider SDK wiring that belongs under `integrations`

### `server/src/integrations`

Owns:

- external provider clients
- provider-specific auth/token/storage adapters
- provider-specific request/response normalization

Rules:

- Google-specific and QuickBooks-specific logic belongs here
- utilities tied to a provider should be migrated here from `utils`

### `server/src/repositories`

Owns:

- persistence access patterns
- query composition
- model coordination for reads/writes

This is a required missing layer to introduce during cleanup.

### `server/src/jobs`

Owns:

- cron entrypoints
- async worker entrypoints
- job locking and scheduling triggers

Rules:

- jobs may call application/services
- jobs must not import controllers

### `server/src/utils`

Owns only:

- generic server helpers with no feature or provider ownership

Must not become:

- an overflow area for integration logic
- an overflow area for use-case orchestration

## Shared Package Ownership

`shared/src` owns:

- schemas
- contracts
- permission definitions
- module constants
- shared types and pure helpers used by both client and server

Rules:

- `shared/src` is source-only
- generated JavaScript must not be committed under `shared/src`
- runtime build output belongs in `shared/dist`

## Route Ownership Rules

The backend must expose one canonical route family per concern.

### Canonical Route Families

- `/api/auth/*` -> auth routes
- `/api/company/*` -> company onboarding and membership
- `/api/users/*` -> user management
- `/api/roles/*` -> RBAC
- `/api/inventory/*` -> inventory domain
- `/api/pos/*` -> POS domain
- `/api/accounting/*` -> accounting domain
- `/api/integrations/google/*` -> Google integration workflows
- `/api/integrations/quickbooks/*` -> QuickBooks integration workflows
- `/api/settings/*` -> settings read/write surfaces only
- `/api/tasks/*` and `/api/cron/*` -> task runner and scheduler entrypoints

### Route Rules

- do not create multiple route families for the same Google Sheets workflow
- do not keep parallel legacy aliases after canonical ownership is defined unless explicitly documented as compatibility-only
- compatibility aliases, if temporarily required, must:
  - be listed in docs
  - be marked deprecated
  - point to the same controller/application contract
- debug routes must live under `/api/debug/*` and must not become primary product APIs

### Settings vs Integrations Split

`/api/settings/*` is for product settings surfaces.

`/api/integrations/*` is for provider connection, sync, callback, debug, and provider-owned operations.

Rules:

- connection start/callback/status belongs to `integrations`
- provider sync and debug endpoints belong to `integrations`
- settings endpoints may read/write user-facing preferences but must not become the primary home for provider workflows

## Allowed Dependency Directions

### Client

Allowed:

- `app` -> `modules`, `components`, `layout`, `hooks`, `lib`, `utils`, `constants`, `types`
- `modules` -> `app` public APIs, `components`, `layout`, `hooks`, `lib`, `utils`, `constants`, `types`, `@retailsync/shared`
- `components` -> `components`, `layout`, `hooks`, `lib`, `utils`, `constants`, `types`, `@retailsync/shared`

Forbidden:

- `components` -> `modules/*` internals
- one module importing another module's private components/pages/state
- `app` becoming a container for feature business logic

### Server

Allowed:

- `app.ts` -> `routes`
- `routes` -> `middleware`, `controllers`
- `controllers` -> `application`, `services`, request schemas, shared contracts
- `application` -> `services`, `repositories`, `integrations`, shared contracts
- `services` -> `repositories`, `integrations`, shared contracts
- `repositories` -> `models`
- `jobs` -> `application`, `services`, `repositories`, `integrations`

Forbidden:

- `controllers` -> `controllers`
- `jobs` -> `controllers`
- `integrations` -> `controllers`
- `routes` -> `services` or `models`
- `utils` owning provider-specific or use-case-specific workflows

## Cleanup Constraints For All Agents

- Do not modify code outside assigned ownership.
- Preserve one owner per writable file set.
- Stabilize contracts before frontend work begins.
- Eliminate duplicate route namespaces before adding new integration behavior.
- Move logic down the stack:
  - HTTP concerns -> controllers
  - orchestration -> application
  - provider logic -> integrations
  - persistence -> repositories

## Immediate Violations To Correct In Cleanup

- overlapping Google Sheets route families under `server/src/app.ts`
- controller-to-controller imports
- job-to-controller imports
- settings and POS frontend modules importing each other's internals
- module-owned components re-exported through shared component folders
- committed generated `.js` files under `shared/src`
