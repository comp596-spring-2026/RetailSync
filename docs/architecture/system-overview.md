# System Overview

## Purpose

RetailSync is a multi-tenant retail operations platform with strict company isolation, server-authoritative RBAC, OTP-based auth recovery/verification, and integration points for Google Sheets and email delivery.

## High-Level Architecture

```mermaid
flowchart LR
  User["Retail User"] --> Client["React Client\nVite + Redux Toolkit"]
  Client -->|"HTTPS + JWT Bearer"| API["Express API"]
  Client -->|"HttpOnly refresh cookie"| API
  API --> Mongo[("MongoDB")]
  API --> Shared["Shared Schemas\n@retailsync/shared"]
  API --> Google["Google APIs\nSheets + OAuth"]
  API --> Resend["Resend Email API"]
  Client --> Shared
```

## Runtime Component Model

```mermaid
flowchart TD
  subgraph Browser
    Router["React Router"]
    Store["Redux Store"]
    Guard["PermissionGate / ProtectedRoute"]
    Axios["Axios + refresh interceptor"]
  end

  subgraph Server
    Auth["requireAuth"]
    Perm["requirePermission(module, action)"]
    Ctrl["Controller Layer"]
    Models["Mongoose Models"]
    Mail["Email Service"]
    Sheets["Sheets Service"]
  end

  Router --> Guard --> Axios --> Auth --> Perm --> Ctrl --> Models
  Ctrl --> Mail
  Ctrl --> Sheets
  Models --> DB[("MongoDB")]
```

## Tenant Isolation Strategy

1. `requireAuth` resolves user and sets tenant context.
2. Protected controllers reject requests without tenant/company identity.
3. Tenant entities include `companyId`.
4. Queries use `{ companyId: req.companyId }` filters.
5. Role permissions are resolved in tenant scope.

## Auth and Recovery Model

```mermaid
sequenceDiagram
  participant U as User
  participant C as Client
  participant A as API
  participant DB as MongoDB
  participant M as Mail Provider

  U->>C: Register
  C->>A: /api/auth/register
  A->>DB: Store user + hashed verification token
  A->>M: Send verification OTP
  U->>C: Enter OTP
  C->>A: /api/auth/verify-email
  A->>DB: Validate hash + expiry + consume token

  U->>C: Forgot password
  C->>A: /api/auth/forgot-password
  A->>DB: Store hashed reset token
  A->>M: Send reset OTP
  U->>C: Enter reset OTP + new password
  C->>A: /api/auth/reset-password
  A->>DB: Validate token + rotate sessions + update password
```

## Integration Model

- Google Sheets: service account reads + OAuth token flow for user-connected sheets.
- Email delivery: Resend for verification and reset OTP.
- Integration settings and secrets are split for safe UI exposure vs secure token storage.

## Current Domain Coverage

- Auth, onboarding, RBAC
- POS and reports
- Items, locations, immutable inventory ledger
- Integrations settings shell + Google Sheets read/connect flows
- OTP email verification and password recovery
