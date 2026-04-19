# Client Architecture

## Stack

- React 18
- Vite
- TypeScript
- Material UI
- React Router
- Redux Toolkit
- Axios
- Vitest + React Testing Library

## High-Level Structure

```text
client/src/
  app/
    api/
    guards/
    layout/
    pages/
    store/
  modules/
    accounting/
    auth/
    dev/
    pos/
    procurement/
    quickbooks/
    rbac/
    settings/
    users/
  components/
  constants/
```

## Current Route Ownership

Public:
- auth pages
- legal/demo/dev pages

Protected:
- dashboard shell
- POS
- statements
- QuickBooks workspace
- settings
- access

## Notes On Current Architecture

- QuickBooks has a dedicated module workspace under `client/src/modules/quickbooks`.
- QuickBooks shared workspace plumbing now lives under `client/src/modules/quickbooks`, even where some detailed page implementations are still shared with older accounting-owned files.
- Procurement still exists in code, but it is not part of the intended visible product navigation.
- Inventory has been removed from the active client surface.

## State Ownership

Current major reducer areas include:
- auth
- company
- rbac
- ui
- settings
- pos

## Permission Model

- sidebar visibility is permission-aware
- route content uses auth/onboarding guards
- action-level controls use `PermissionGate` and `hasPermission`
