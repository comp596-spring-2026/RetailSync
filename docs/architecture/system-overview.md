# System Overview

## Purpose

RetailSync is a multi-tenant retail operations platform with strict company isolation, server-authoritative RBAC, and integration points for Google Sheets.

## High-Level Architecture

```mermaid
flowchart LR
  User["Retail User"] --> Client["React Client\nVite + Redux Toolkit"]
  Client -->|"HTTPS + JWT Bearer"| API["Express API"]
  Client -->|"HttpOnly refresh cookie"| API
  API --> Mongo[("MongoDB")]
  API --> Shared["Shared Schemas\n@retailsync/shared"]
  API --> Google["Google APIs\nSheets + OAuth"]
  Client --> Shared
```

## Runtime Component Model

```mermaid
flowchart TD
  subgraph Browser
    Router["React Router"]
    Store["Redux Store"]
    Guard["PermissionGate"]
    Axios["Axios + refresh interceptor"]
  end

  subgraph Server
    Auth["requireAuth"]
    Perm["requirePermission(module, action)"]
    Ctrl["Controller Layer"]
    Models["Mongoose Models"]
    Sheets["Sheets Service"]
  end

  Router --> Guard --> Axios --> Auth --> Perm --> Ctrl --> Models
  Ctrl --> Sheets
  Models --> DB[("MongoDB")]
```

## Tenant Isolation Strategy

1. `requireAuth` resolves user and sets tenant context.
2. Protected controllers reject requests without tenant/company identity.
3. Tenant entities include `companyId`.
4. Queries use `{ companyId: req.companyId }` filters.
5. Role permissions are resolved in tenant scope.

## Auth Model (Server API)

```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant A as API
  U->>C: Click Continue with Google
  C->>A: /api/auth/google/start
  A-->>U: Google consent
  U->>A: /api/auth/google/callback
  A-->>C: redirect with accessToken
  C->>A: /api/auth/me
```

## Integration Model

- Google Sheets: service account reads + OAuth token flow for user-connected sheets.
- Integration settings and secrets are split for safe UI exposure vs secure token storage.

## Current Domain Coverage

- Login/onboarding/dashboard routing, RBAC
- POS and reports
- Items, locations, immutable inventory ledger
- Integrations settings shell + Google Sheets read/connect flows
- Server-side Google auth (google start/callback + refresh/logout/me)

## See also

- [Workflows and usage](workflows-and-usage.md) — detailed login, onboarding, POS import sources, no-POS-data behavior, reports, and RBAC.
