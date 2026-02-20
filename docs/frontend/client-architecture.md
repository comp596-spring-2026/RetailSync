# Client Architecture

## Stack

- Vite + React + TypeScript
- MUI for UI
- React Router for routing
- Redux Toolkit + redux-persist
- Axios with refresh-token retry interceptor

## State Slices

- `authSlice`
  - `accessToken`, `user`, `role`, `permissions`
- `companySlice`
  - current company profile
- `rbacSlice`
  - module catalog, roles list
- `uiSlice`
  - snackbar notifications

## Token Flow

```mermaid
sequenceDiagram
  participant UI as UI Action
  participant AX as Axios Interceptor
  participant API as API

  UI->>AX: Request with access token
  AX->>API: API request
  API-->>AX: 401 Unauthorized
  AX->>API: POST /auth/refresh (cookie)
  API-->>AX: new access token
  AX->>AX: update Redux token
  AX->>API: retry original request once
```

## Routing Structure

- public: `/login`, `/register`
- onboarding guarded: `/onboarding/*`
- protected app shell: `/dashboard/*`

Main dashboard pages currently:
- `/dashboard/pos`
- `/dashboard/reports`
- `/dashboard/items`
- `/dashboard/locations`
- `/dashboard/inventory`
- `/dashboard/users`
- `/dashboard/roles`

## Permission Rendering Rules

- Sidebar module link appears if user has `view` for that module.
- `PermissionGate` checks actions for each button.
- Pages render `NoAccess` when module view permission is absent.
