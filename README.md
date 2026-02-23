# RetailSync

Multi-tenant retail operations platform for small grocery stores and gas stations.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-10.x-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-18.x-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Redux Toolkit](https://img.shields.io/badge/Redux%20Toolkit-2.x-764ABC?logo=redux&logoColor=white)](https://redux-toolkit.js.org/)
[![Material UI](https://img.shields.io/badge/MUI-6.x-007FFF?logo=mui&logoColor=white)](https://mui.com/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.x-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Mongoose](https://img.shields.io/badge/Mongoose-8.x-880000)](https://mongoosejs.com/)
[![Zod](https://img.shields.io/badge/Zod-3.x-3E67B1)](https://zod.dev/)
[![JWT](https://img.shields.io/badge/JWT-Auth-000000?logo=jsonwebtokens&logoColor=white)](https://jwt.io/)
[![Vitest](https://img.shields.io/badge/Vitest-2.x-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Google APIs](https://img.shields.io/badge/Google%20APIs-Sheets%20%2B%20OAuth-4285F4?logo=google&logoColor=white)](https://developers.google.com/sheets/api)
[![Resend](https://img.shields.io/badge/Resend-Email%20Delivery-000000)](https://resend.com/)

## Overview

RetailSync centralizes sales, inventory, permissions, and operational workflows with strict tenant scoping and role enforcement.

It solves:

- fragmented POS and stock workflows
- inconsistent permission enforcement
- weak traceability for inventory changes
- missing secure auth recovery and verification flows
- need for integrations (Google Sheets and email delivery)

## Major Features

| Area | Capabilities |
|---|---|
| Auth | Register/login/refresh/logout, OTP email verification, OTP reset password |
| Tenant and RBAC | `companyId`-scoped data, server-side permission checks |
| POS | CSV import, daily views, monthly reporting |
| Inventory | Items, locations, immutable `InventoryLedger` movements |
| Integrations | Google Sheets (service account + OAuth connect scaffolding), Resend email delivery |
| Quality | Vitest test suites, Docker workflows, CI quality gates |

## External Product Dependencies

| Product | Used For | Required Env |
|---|---|---|
| Google APIs (`googleapis`) | Sheets read and OAuth connect/callback flow | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI` |
| Resend | Transactional email delivery (verification/reset OTP) | `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_BRAND_ICON_URL` |

## Brand Assets

Client brand assets are served from `/client/public/brand` and used across auth UI and email templates.

| Asset | Purpose |
|---|---|
| `icon.svg` / `icon.png` / `icon.ico` | icon-only mark, favicon, compact UI |
| `BigLogo.png` | large auth/onboarding logo (icon + wordmark) |
| `logo-horizontal-removebg.png` | horizontal logo in dashboard header |

## Architecture

```mermaid
flowchart LR
  subgraph TenantBoundary["Tenant Boundary (companyId scoped)"]
    C["React Client"] --> A["Auth Middleware"] --> R["RBAC Guard"] --> API["Express Controllers"]
    API --> DB[("MongoDB")]
  end

  POS["POS CSV"] --> API
  GS["Google Sheets API"] --> API
  RESEND["Resend Email API"] --> API
```

## Auth OTP Workflow

```mermaid
sequenceDiagram
  participant U as User
  participant UI as Client
  participant API as Server
  participant M as MongoDB
  participant E as Resend

  U->>UI: Register
  UI->>API: POST /api/auth/register
  API->>M: Store user + hashed verification token
  API->>E: Send verification OTP email
  API-->>UI: Account created

  U->>UI: Enter OTP
  UI->>API: POST /api/auth/verify-email
  API->>M: Match hashed token + expiry + consumedAt
  API->>M: Set emailVerifiedAt
  API-->>UI: Verified
```

## Integration Workflow (POS Sources)

```mermaid
flowchart TD
  A["POS Source Modal"] --> B["Upload CSV/XLSX"]
  A --> C["Google OAuth Connect"]
  A --> D["Service Account Access"]

  B --> E["/api/pos/import-file"]
  C --> F["/api/google/connect-url and callback"]
  C --> G["/api/sheets/read"]
  D --> G
  G --> H["Preview Rows"]
  H --> I["/api/pos/import-rows"]
```

## Monorepo Structure

```text
RetailSync/
  client/        # Vite + React + TypeScript + Redux Toolkit + MUI
  server/        # Express + TypeScript + MongoDB + Mongoose + Zod + JWT
  shared/        # Shared types and Zod schemas
  docs/          # Architecture, backend, frontend, operations, testing
  docker-compose.yml
  pnpm-workspace.yaml
```

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 10+
- Docker Desktop (recommended for Mongo)

### Install

```bash
make install
```

### Start

```bash
make dev
```

Default local endpoints:

- Client: `http://localhost:4630`
- Server: `http://localhost:4000`
- Health: `http://localhost:4000/health`

### Quality Gate

```bash
make typecheck
make lint
make test
make build
make check
```

## Environment Variables

### Server (`/server/.env`)

| Variable | Required | Notes |
|---|---|---|
| `PORT` | Yes | API port (`4000`) |
| `MONGO_URI` | Yes | Mongo connection string |
| `JWT_ACCESS_SECRET` | Yes | Access token signing secret |
| `JWT_REFRESH_SECRET` | Yes | Refresh token signing secret |
| `CLIENT_URL` | Yes | Allowed CORS origin |
| `NODE_ENV` | Yes | `development` / `test` / `production` |
| `RESEND_API_KEY` | No* | Required for real email delivery |
| `RESEND_FROM` | No* | Must match Resend sending policy/domain |
| `RESEND_BRAND_ICON_URL` | No | Logo URL in HTML email templates |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | No | Service account auth for Sheets read |
| `GOOGLE_OAUTH_CLIENT_ID` | No | Google OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | No | Google OAuth |
| `GOOGLE_OAUTH_REDIRECT_URI` | No | Google OAuth callback |

### Client (`/client/.env`)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | Yes | API base URL (for local: `http://localhost:4000/api`) |

## Testing

| Layer | Tooling | Notes |
|---|---|---|
| Unit | Vitest | utility, schema, email transport tests |
| Integration | Vitest + mongodb-memory-server | DB-backed auth and domain tests |
| UI | Vitest + RTL | component-level behavior |
| E2E | Planned | Playwright roadmap |

## API and Docs

- API reference: `/Users/trupal/Projects/RetailSync/docs/backend/api-reference.md`
- Email system guide: `/Users/trupal/Projects/RetailSync/docs/email-system.md`
- System architecture: `/Users/trupal/Projects/RetailSync/docs/architecture/system-overview.md`
- Local runbook: `/Users/trupal/Projects/RetailSync/docs/operations/local-development.md`
- Testing strategy: `/Users/trupal/Projects/RetailSync/docs/testing/testing-strategy.md`

## Docker

```bash
make start
make stop
make logs
make reset
```

Services:

- `mongo` -> `27017`
- `server` -> `4000`
- `client` -> `8080`

## Security Notes

- Tenant isolation is enforced with `companyId` on protected domains.
- Role permission checks are server-authoritative.
- Inventory is append-only ledger based.
- OTP tokens are stored hashed, with expiry and one-time consumption.
- Refresh token rotation and revocation are implemented.

## License

License: TBD
