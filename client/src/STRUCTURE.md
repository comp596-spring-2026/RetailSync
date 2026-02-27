# Client `src/` structure

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
- **`pos/`** — POS import flow: `ImportPOSDataModal`, `MatchingWizard`, `TabSelectorDialog`.

(Guards live under `app/guards/`, not here.)

---

## `slices/` — Redux state (slices)

One folder per slice; each contains the Redux slice and optionally slice-specific types/utils.

- `auth/` — authSlice (user, token, permissions). **Does not** call API (avoids circular deps with `api/client` which uses the store).
- `company/` — companySlice.
- `rbac/` — rbacSlice.
- `ui/` — uiSlice (snackbar, etc.).

**When to use thunks vs helpers vs component fetch**

- **Thunks (RTK `createAsyncThunk`):** Use when you want loading/error state in Redux and the slice can safely import the API. Our `api/client` imports the store and auth slice, so **slices do not import from `api/`** to avoid circular dependencies. So we don’t put “fetch and put in Redux” thunks inside slices that are used by the store at bootstrap.
- **Helpers:** For “fetch and sync to Redux” we use a helper that lives in `app/` and is only used by pages. Example: **`app/auth/fetchMeAndSync`** — calls `authApi.me()`, dispatches `setAuthContext` and `setCompany`, returns the me data. Used after login (GoogleAuthSuccessPage) and after create/join company (CreateCompanyPage, JoinCompanyPage) so auth + company state stay in one place.
- **Component-level fetch:** POS, reports, items, locations, inventory, settings, users, roles are fetched in the component (or a hook) and stored in local state. They are not in Redux; use the API modules directly from the barrel.

---

## `pages/` — Route-level screens

Grouped by flow: **`auth/`** (Login, GoogleAuthSuccess), **`onboarding/`** (Onboarding, CreateCompany, JoinCompany), **`dashboard/`** (DashboardHome, POS, Reports, Items, etc.), **`legal/`** (Privacy, Terms, DataDeletion), **`demo/`** (HomeDemo), **`errors/`** (401, 403, 404, 500).

- **Error pages** (`pages/errors/`) — `UnauthorizedPage` (401), `ForbiddenPage` (403), `NotFoundPage` (404), `ServerErrorPage` (500). Shared `ErrorPageLayout` with logo, message, and primary/secondary actions. Used so users can navigate back when something goes wrong.
- **Flow:** No token on protected route → `/401` → “Sign in” → `/login`. Unknown path → `/404`. After failed refresh (e.g. expired session), API client redirects to `/401`. You can `navigate('/403')` or `navigate('/500')` from components when handling API errors.

---

## Redux + API layering

- **Store:** `app/store/` — configureStore, root reducer, persist, hooks. Single source of truth for auth, company, rbac, ui.
- **Slices:** `slices/` — one folder per slice (auth, company, rbac, ui). Slices do not import API (avoids circular deps).
- **API (service layer):** `api.ts` + `api/` — class-based clients; call after import, e.g. `authApi.me()`, `companyApi.create(payload)`.

---

## `api.ts` + `api/` — API clients (OOP)

Single entry **`api.ts`** re-exports all clients so you can **import then call**: `import { authApi } from '../api'; authApi.me();`

Under **`api/`**, each domain is a **class** with a singleton export (e.g. `AuthApi` → `authApi`). Shared axios instance in `api/client.ts`.

- **`client.ts`** — Axios instance, auth header, refresh-on-401, redirect to `/401` on refresh failure.
- **`auth/AuthApi.ts`** — `authApi` (me, logout).
- **`company/CompanyApi.ts`** — `companyApi` (create, join, mine).
- **`rbac/RbacApi.ts`**, **`users/UserApi.ts`**, **`settings/SettingsApi.ts`**, **`pos/PosApi.ts`**, **`reports/ReportsApi.ts`**, **`items/ItemsApi.ts`**, **`locations/LocationsApi.ts`**, **`inventory/InventoryApi.ts`** — same pattern.

**Import:** `import { authApi, posApi } from '../api';` or `import { authApi } from '../api/auth';`

---

## `lib/` — Client-side shared code

Code used across the client (utils, hooks, constants, types). Not the same as the monorepo package `@retailsync/shared` (see below).

- `utils/` — permissions helper, date, table, apiError.
- `hooks/` — e.g. `useTablePagination`, `useAsyncAction`.
- `constants/` — pagination, modules, error codes, company options.
- `types/` — client TypeScript types.

---

## Two “shared” concepts

- **`@retailsync/shared`** (repo root `shared/` package) — Shared by **server and client**: Zod schemas, permission types, module constants. Import as `from '@retailsync/shared'`.
- **`lib/`** (client only) — Shared only across **client** code: hooks, utils, constants. Import as `from '../lib/...'`. Renamed from `shared/` to avoid confusion with the package name.
