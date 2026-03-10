# RetailSync Module Structure Report

Date: 2026-03-10

## Confirmed Module Set

The client feature modules are now aligned to:

1. `auth`
2. `inventory`
3. `pos`
4. `procurement`
5. `users`
6. `rbac`
7. `settings`
8. `accounting`
9. `dev`

## Store Architecture

Global store infrastructure only:

- `client/src/app/store/index.ts`
- `client/src/app/store/rootReducer.ts`
- `client/src/app/store/hooks.ts`

Feature-owned Redux state:

- `client/src/modules/auth/state/*`
- `client/src/modules/inventory/state/*`
- `client/src/modules/pos/state/*`
- `client/src/modules/users/state/*`
- `client/src/modules/rbac/state/*`
- `client/src/modules/settings/state/*`

`procurement` and `dev` currently do not require dedicated slices.

## API Layer Architecture

Global HTTP client:

- `client/src/app/api/client.ts`
- `client/src/app/api/index.ts`

Module API wrappers:

- `client/src/modules/auth/api/*`
- `client/src/modules/users/api/*`
- `client/src/modules/rbac/api/*`
- `client/src/modules/inventory/api/*`
- `client/src/modules/pos/api/*`
- `client/src/modules/settings/api/*`
- `client/src/modules/accounting/api/*`

Legacy `client/src/api.ts` and `client/src/api/index.ts` were removed.

## Routing Ownership

`client/src/app/App.tsx` imports pages from module paths directly, including:

- auth pages from `modules/auth/pages`
- dev pages (home demo/legal/errors/playground) from `modules/dev/pages`
- inventory pages from `modules/inventory/pages`
- pos pages from `modules/pos/pages`
- procurement pages from `modules/procurement/pages`
- users pages from `modules/users/pages`
- rbac pages from `modules/rbac/pages`
- settings pages from `modules/settings/pages`
- accounting pages from `modules/accounting/pages`

## Reports Status

- Client reports feature routes/pages/nav were removed from module ownership.
- Backend `reports` APIs remain available (`/api/reports/*`) for compatibility and existing server test coverage.

## Current Topology (High Level)

```text
client/src/
  app/
    api/
    auth/
    guards/
    layout/
    providers/
    routes/
    store/
  modules/
    auth/
      api/
      pages/
      state/
    dev/
      pages/
    inventory/
      api/
      components/
      pages/
      state/
      tests/
    pos/
      api/
      charts/
      components/
      hooks/
      pages/
      state/
      tests/
      utils/
    procurement/
      pages/
    rbac/
      api/
      pages/
      state/
      tests/
    settings/
      api/
      components/
      pages/
      state/
      tests/
    accounting/
      api/
      components/
      pages/
    users/
      api/
      pages/
      state/
      tests/
  components/
  layout/
```

## Validation

- Client typecheck: `pnpm -C client exec tsc --noEmit` passed
- Client tests: `pnpm -C client test` passed
