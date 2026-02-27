# RetailSync: Workflows and Usage (Detailed)

This document describes end-to-end flows, usage structure, and edge cases (e.g. no POS data) so the project stays consistent and testable.

---

## 1. Project structure (monorepo)

```
RetailSync/
├── client/          # @retailsync/client — React + Vite + Redux
├── server/          # @retailsync/server — Express + MongoDB
├── shared/          # @retailsync/shared — Zod schemas, permissions, types, utils
├── docs/            # Architecture, backend, frontend, operations, testing, QRs
└── package.json     # pnpm workspace root
```

- **client**: React 18, TypeScript, Redux Toolkit, Redux Persist (auth), React Router, MUI, Axios with 401-refresh interceptor.
- **server**: Express, Mongoose, JWT (access + refresh), cookie-parser, multer (file upload), Google APIs (OAuth + Sheets).
- **shared**: Consumed by both; defines permission modules, API request/response schemas (e.g. POS daily, monthly summary).

---

## 2. Authentication flow

- **Method**: Google OAuth only. There is no email/password register or login.
- **Endpoints**:
  - `GET /api/auth/google/start` — redirects to Google consent; sets `googleOAuthState` cookie.
  - `GET /api/auth/google/callback` — exchanges code, creates/updates user, issues tokens; redirects to client with `accessToken` in URL or error in query.
  - `POST /api/auth/refresh` — body optional; uses HttpOnly `refreshToken` cookie; returns new `accessToken` and rotates refresh token.
  - `POST /api/auth/logout` — revokes current refresh token, clears `refreshToken` cookie.
  - `GET /api/auth/me` — requires Bearer token; returns `user`, `company`, `role`, `permissions`.

**Login flow (user perspective)**  
1. User opens app → root redirects to `/login`.  
2. User clicks “Continue with Google” → browser goes to `/api/auth/google/start` (same origin or configured API origin).  
3. User signs in with Google → callback hits `/api/auth/google/callback`.  
4. Server creates or updates user (no `companyId` until onboarding), issues access + refresh, redirects to:  
   - `{CLIENT_URL}/auth/google/success?accessToken=...`  
5. Client `GoogleAuthSuccessPage` reads `accessToken`, stores it (Redux), calls `GET /api/auth/me`.  
6. If `me.data.company` exists → redirect to `/dashboard`; else → redirect to `/onboarding`.

**Token handling**  
- Access token: short-lived (15 min); sent as `Authorization: Bearer <token>`; not persisted to disk (memory/Redux only; Redux Persist can rehydrate).  
- Refresh token: 7-day HttpOnly cookie; used only by `/api/auth/refresh`.  
- On any 401, client Axios interceptor calls `/api/auth/refresh` once; on success retries request with new access token; on failure dispatches logout + clearCompany (user effectively unauthenticated; next route render sends them to `/login`).

---

## 3. Onboarding and company context

- **Guards**:
  - **ProtectedRoute**: Renders `<Outlet />` only if `auth.accessToken` exists; otherwise `<Navigate to="/login" />`.
  - **OnboardingGuard**: Wraps `/onboarding`, `/onboarding/create-company`, `/onboarding/join-company`. If no token → login; if `user.companyId` is set → `<Navigate to="/dashboard" />`; else shows onboarding routes.

So: authenticated user with no company can only reach onboarding (and public pages). Authenticated user with company can reach dashboard; onboarding routes redirect them to dashboard.

**Create company**  
- `POST /api/company/create` — body: company details (name, businessType, address, etc.).  
- Server: creates Company, creates default roles (Admin/Member/Viewer), assigns user as Admin, creates first Invite and marks it accepted.  
- Response includes `company` and `roles`. Client then typically calls `GET /api/auth/me` again and redirects to `/dashboard`.

**Join company**  
- `POST /api/company/join` — body: `companyCode`, `inviteCode`, `email`.  
- Server checks: user exists, has no company, email matches body, company exists, invite exists and is not expired/accepted, role exists. Then assigns `companyId` and `roleId`, marks invite accepted.  
- Client updates auth/company state and redirects to `/dashboard`.

**Company on API**  
- After `requireAuth`, if the user has `companyId`, it is set on `req.companyId`.  
- Protected resource endpoints (POS, reports, items, locations, inventory, etc.) return 403 “Company onboarding required” when `req.companyId` is missing.

---

## 4. POS: import sources and “no POS data”

### 4.1 Import sources

1. **CSV file**  
   - `POST /api/pos/import` — `multipart/form-data`, field `file` (CSV).  
   - Parsed with header row; rows mapped to POS daily summary fields (date, highTax, lowTax, etc.).  
   - Valid rows upserted by `(companyId, date)`.

2. **XLSX or CSV file**  
   - `POST /api/pos/import-file` — same as above but accepts `.csv` or `.xlsx`; first sheet used for XLSX.

3. **Raw rows (JSON)**  
   - `POST /api/pos/import-rows` — body: `{ rows: string[][], hasHeader?: boolean }`.  
   - Used for pasted or programmatic data.

4. **Google Sheets (shared / service account)**  
   - Company must have Integration Settings with a shared Google Sheet configured (spreadsheetId, sheetName, headerRow).  
   - `POST /api/pos/import/sheets/preview` — reads sheet, returns header, sample rows, mapping suggestions.  
   - `POST /api/pos/import/sheets/match` — validates mapping + optional transforms.  
   - `POST /api/pos/import/sheets/commit` — reads full sheet, maps rows, upserts POS data, updates last import metadata and creates an ImportJob record.

All import endpoints require `req.companyId` and permissions `pos:create` and `pos:import` (or equivalent `actions:import` in role).

### 4.2 When POS has no data

- **List daily**: `GET /api/pos/daily?start=YYYY-MM-DD&end=YYYY-MM-DD`.  
  - If there are no POS rows for that range: returns `200` with `data: []`.  
  - Client POS page shows the table with empty body; optionally an explicit “No POS data for this period” message.

- **Import**: If the uploaded/pasted data has no valid rows (e.g. no date column, or all rows fail validation), the server returns 422 with a message such as “No valid POS rows found”.  
  - Client should show that error in the import modal.

---

## 5. Reports (monthly summary)

- **Endpoint**: `GET /api/reports/monthly-summary?month=YYYY-MM`.  
- **Behavior**: Aggregates POS daily rows for that month for `req.companyId`.  
- **When there is no POS data for the month**:  
  - Query returns no documents; the reducer yields an object with `days: 0` and all sums (e.g. `sumTotalSales`, `sumCreditCard`, …) equal to `0`.  
  - Response is always a single summary object (never null).  
- **Client**: Reports page shows metric cards; for a month with no data, all values are 0. No separate “no data” state is required unless you want a message like “No POS data for this month.”

---

## 6. Items, locations, inventory

- **Items**: CRUD + CSV import; all scoped by `companyId`.  
- **Locations**: CRUD by `companyId`.  
- **Inventory**: Event-sourced.  
  - `POST /api/inventory/move` — creates an immutable ledger entry (itemId, from/to location codes, qty, notes).  
  - `GET /api/inventory/location/:code` — aggregate view of current quantity at that location for the company.  
- **Tenant isolation**: Items, locations, and ledger entries are filtered by `companyId`; cross-tenant reads/writes are blocked (enforced by controllers and tests).

---

## 7. RBAC and permission gates

- **Server**: `requirePermission(module, action)` runs after `requireAuth`. Permissions come from the user’s role (e.g. `pos:view`, `pos:create`, `pos:import`).  
- **Client**: `hasPermission(permissions, module, action)` and `<PermissionGate module="pos" action="view">` hide or disable UI.  
- **Dashboard sidebar**: Links (POS, Reports, Items, etc.) are shown based on `view` permission for each module.  
- **POS page**: “Add POS Source” (import) is gated by `pos:create` and `pos:import` (or equivalent); daily table is gated by `pos:view`.  
- **No access**: If user has no permission for a module, the module page can render a “No access” component instead of content.

---

## 8. Usage structure summary

| Step | Action | Result |
|------|--------|--------|
| 1 | Open app | Redirect to `/login` |
| 2 | Continue with Google | OAuth → `/auth/google/success` with token |
| 3 | Client calls `/api/auth/me` | If no company → `/onboarding`; if company → `/dashboard` |
| 4 | Create or join company | User gets `companyId` and role; redirect to `/dashboard` |
| 5 | Dashboard | Sidebar and pages respect permissions; company-scoped data only |
| 6 | POS: no data yet | POS page shows empty table (and optionally “No POS data” message); Reports shows zeros for selected month |
| 7 | POS: add source | File upload or Sheets flow; after success, daily list and reports show data |
| 8 | 401 on any API call | Client tries refresh; on failure, logout + clear company; next navigation sends to `/login` |

---

## 9. Test coverage alignment

- **Auth**: Refresh rotation and old-token reuse (`auth.refresh.test.ts`); Google callback and user create/update (`auth.google.test.ts` if present).  
- **Tenant isolation**: Cross-tenant items and inventory aggregates (`tenantIsolation.test.ts`).  
- **Inventory**: Ledger immutability (`inventoryLedger.immutability.test.ts`).  
- **Health**: `/health` contract (`app.test.ts`).  
- **POS no data**: List daily returns `[]`; monthly summary returns zeroed totals (covered by server tests below).  
- **Client**: Permissions util, PermissionGate, ImportPOSDataModal (and optionally empty state on POS page).

Adding or updating tests for “no POS data” and “reports empty month” keeps behavior documented and regression-safe.
