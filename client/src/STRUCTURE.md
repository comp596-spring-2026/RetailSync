# Client `src/` structure

This document describes the canonical client boundary rules during the cleanup phase.

For repo-wide ownership and backend route rules, see
`docs/architecture/MODULE_STRUCTURE_REPORT.md` and
`docs/architecture/layer-boundaries.md`.

## `app/` — Application shell

Everything that wraps or controls the app: layout, routing, auth/route guards, store, and providers.

- **`auth/`** — Auth flow helpers used by pages only (e.g. `fetchMeAndSync`: fetch `/auth/me` and sync user/company into Redux). Kept out of slices to avoid circular deps with `api/client`.
- **`guards/`** — Route and permission guards
  - `ProtectedRoute` — Requires auth token; redirects to `/401` (Unauthorized page) otherwise.
  - `OnboardingGuard` — Wraps onboarding routes; redirects to `/dashboard` if user has company, to `/login` if no token.
  - `PermissionGate` — UI guard: hide or disable children based on RBAC (used in pages for buttons/tables).
- **`layout/`** — Dashboard layout (sidebar, outlet).
- **`providers/`** — Redux Provider, Router, Theme, PersistGate, etc.
- **`routes/`** — Route config re-export (e.g. `AppRoutes`).
- **`store/`** — Redux store and hooks.

**Import guards from app:** `import { PermissionGate, ProtectedRoute, OnboardingGuard } from '../app/guards';`

---

## `components/` — Reusable UI

Organized by role; consumed via barrel `import { X } from '../components'`.

- **`ui/`** — Feedback and layout primitives: `LoadingEmptyStateWrapper`, `WonderLoader`, `NoAccess`, `ErrorBoundary`, `AppSnackbar`, `PageHeader`, `AuthShell`.
- **`brand/`** — `BrandLogo`.
- **`common/`** — Shared CRUD UI: `SearchableCrudTable`, `CrudEntityDialog`, `ConfirmDeleteDialog`.
- **Rule:** only app-wide reusable UI belongs here.

Must not live here:

- module-specific workflow components
- module-specific re-export shims
- feature-specific API-calling containers

(Guards live under `app/guards/`, not here.)

---

## `modules/*/state/` — Redux feature state

Redux state is feature-owned under `modules/<feature>/state`.

- `modules/auth/state` — auth reducer/actions/types.
- `modules/users/state` — company reducer/actions.
- `modules/rbac/state` — rbac reducer/actions.
- `app/store/uiSlice.ts` — global UI reducer/actions.
- `modules/inventory/state`, `modules/settings/state`, `modules/pos/state`.
- Each feature exposes a public state API via `modules/<feature>/state/index.ts`.

**When to use thunks vs helpers**

- **Thunks (RTK `createAsyncThunk`):** Default for shared async work. Components dispatch thunks and read selectors instead of calling API clients directly.
- **Helpers:** Use narrow helpers for bootstrap or fan-out flows that update multiple slices. Example: **`app/auth/fetchMeAndSync`** calls `authApi.me()`, dispatches `setAuthContext` and `setCompany`, and returns the me data.
- **Component local state:** Keep only ephemeral UI here, such as dialog visibility, unsaved form inputs, and temporary wizard steps.
- **Module workflow hooks/helpers:** Use when a page or dialog becomes orchestration-heavy. Keep cross-step setup logic in module-owned hooks/helpers instead of large page files.

---

## `pages/` — Route-level screens

Pages are route entrypoints only.

They may:

- compose module components
- call module hooks
- dispatch module actions

They should not become the permanent home for:

- mapping engines
- multi-step setup orchestration
- cross-module integration glue

- **Error pages** (`pages/errors/`) — `UnauthorizedPage` (401), `ForbiddenPage` (403), `NotFoundPage` (404), `ServerErrorPage` (500). Shared `ErrorPageLayout` with logo, message, and primary/secondary actions. Used so users can navigate back when something goes wrong.
- **Flow:** No token on protected route → `/401` → “Sign in” → `/login`. Unknown path → `/404`. After failed refresh (e.g. expired session), API client redirects to `/401`. You can `navigate('/403')` or `navigate('/500')` from components when handling API errors.

---

## Redux + API layering

- **Store:** `app/store/` — configureStore, root reducer, persist, hooks. Infrastructure only.
- **Feature state:** `modules/*/state/` — feature reducers/actions/selectors/thunks.
- **Module API:** `modules/*/api/` — module-owned HTTP wrappers.
- **Module workflow layer:** `modules/*/hooks/` and module-local helpers/lib for orchestration-heavy UI flows.

Boundary rules:

- modules may use shared UI from `components/`
- shared `components/` must not import module internals
- one module must not depend on another module's private pages/components/state
- cross-module behavior should be coordinated through backend contracts or narrow public exports

---

## `app/api/` and `modules/*/api/` — API clients

- **`app/api/client.ts`** — shared Axios instance, auth header, refresh-on-401 behavior.
- **`modules/*/api/`** — module-owned domain wrappers.

Rule:

- components/pages dispatch state actions or call module workflow helpers; they should not import API clients directly
- use the API wrapper owned by the current module
- do not import another module's API just to reach into its workflow
- if two modules need the same backend capability, stabilize the backend contract and expose a narrow public wrapper instead of coupling page internals

---

## `lib/` — Client-side shared code

Code used across the client (utils, hooks, constants, types). Not the same as the monorepo package `@retailsync/shared` (see below).

- `utils/` — permissions helper, date, table, apiError.
- `hooks/` — app-wide hooks such as `useTablePagination`, `useAsyncAction`.
- `constants/` — pagination, modules, error codes, company options.
- `types/` — client TypeScript types.

Do not place module-specific mapping or setup flows here.

---

## Two “shared” concepts

- **`@retailsync/shared`** (repo root `shared/` package) — Shared by **server and client**: Zod schemas, permission types, module constants. Import as `from '@retailsync/shared'`.
- **`lib/`** (client only) — Shared only across **client** code: hooks, utils, constants. Import as `from '../lib/...'`. Renamed from `shared/` to avoid confusion with the package name.
