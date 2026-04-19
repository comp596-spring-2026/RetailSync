# Skill: Setup OAuth

## Goal

Implement secure, tenant-scoped OAuth flows for external integrations (QuickBooks, Google) with reliable token lifecycle management, safe storage, and retry-safe refresh behavior.

---

## Use This Skill When

- adding a new OAuth provider
- implementing or fixing callback handling
- debugging token refresh or expiry issues
- auditing redirect URI, state handling, or secret persistence
- handling reconnect or revoked token scenarios

---

## Required Architecture

### Separation of Concerns

- Controllers / routes:
  - initiate OAuth flow
  - handle callback

- Integration services:
  - token exchange
  - token refresh
  - provider API calls

- Persistence:
  - `IntegrationSecret` → tokens (encrypted)
  - `IntegrationSettings` → connection state, metadata

---

## OAuth Flow Overview

### Step 1: Start Authorization

- Generate provider authorization URL

- Include:
  - tenantId (encoded in state)
  - CSRF-safe random state token
  - redirect URI
  - required scopes

- Persist temporary state:

```ts
{
  (state, tenantId, provider, createdAt, expiresAt);
}
```

---

### Step 2: Handle Callback

- Validate:
  - state exists
  - state not expired
  - tenantId matches

- Exchange authorization code for:
  - accessToken
  - refreshToken
  - expiry
  - provider-specific metadata (realmId for QuickBooks)

---

### Step 3: Persist Credentials

Store ONLY in `IntegrationSecret`:

```ts
{
  tenantId,
  provider,

  credentials: {
    accessToken,
    refreshToken,
    expiry,
    realmId?
  }
}
```

- Encrypt before storing
- Overwrite existing credentials safely

---

### Step 4: Update Connection State

Store in `IntegrationSettings`:

```ts
{
  tenantId,
  provider,
  status: "connected",
  connectedAt,
  lastVerifiedAt
}
```

---

## Token Refresh Logic (CRITICAL)

### Trigger Conditions

- token expired
- 401 response from provider

---

### Refresh Flow

1. Load credentials from `IntegrationSecret`
2. Call provider refresh endpoint
3. Receive:
   - new accessToken
   - possibly new refreshToken

4. Persist updated credentials immediately
5. Retry original request safely

---

### Rules

- Always persist rotated refresh tokens
- Never rely on in-memory tokens
- Never retry request before successful refresh

---

## Determinism & Safety Rules

- OAuth flow must be stateless per request
- Token refresh must be idempotent
- Multiple concurrent refresh attempts must not corrupt stored tokens

---

## Concurrency Control

Prevent race conditions:

- lock per tenant + provider during refresh
- or use atomic update logic

Example:

- only one refresh operation allowed at a time
- other requests wait or retry

---

## Disconnect Flow

- Remove or invalidate credentials in `IntegrationSecret`
- Update `IntegrationSettings.status = "disconnected"`
- Clear provider-specific metadata

---

## Reconnect Flow

- Treat as fresh OAuth flow
- overwrite old credentials
- preserve historical sync metadata if needed

---

## Error Handling

Classify OAuth errors:

- invalid_grant (revoked token)
- expired_token
- invalid_client
- network/transient

### Behavior

- invalid_grant → force reconnect
- expired_token → trigger refresh
- transient → retry with backoff

---

## Observability (REQUIRED)

All OAuth operations must log:

- tenantId
- provider
- operation (start, callback, refresh)
- result (success / failure)
- failure reason (no secrets)

Persist:

- last auth error in `IntegrationSettings`
- last successful refresh timestamp

---

## Redirect URI Rules

- must be environment-specific
- must match provider configuration exactly
- must be centralized (no duplication)

---

## Guardrails

- NEVER store tokens in frontend
- NEVER store tokens in `IntegrationSettings`
- NEVER assume connection flag = valid token
- ALWAYS persist refresh token updates
- ALWAYS validate state parameter
- NEVER log raw tokens

---

## Anti-Patterns

- storing tokens in memory only
- skipping state validation
- not handling refresh token rotation
- retrying failed requests without refresh
- duplicating OAuth logic across files

---

## File Placement

Suggested structure:

```
server/src/integrations/oauth/
  oauthStateStore.ts
  oauthService.ts
  tokenManager.ts
```

Provider-specific:

```
server/src/integrations/quickbooks/oauth.ts
server/src/integrations/google/oauth.ts
```

---

## Example Tasks

- implement QuickBooks OAuth flow
- fix Google token refresh persistence
- add reconnect handling
- audit redirect URI handling

---

## Deliverables

- OAuth start + callback implementation
- secure token storage
- refresh token logic
- disconnect/reconnect flows
- error classification + handling
- logging + observability

---

## Test Requirements

Must cover:

- successful OAuth flow
- invalid/expired state
- token refresh success
- refresh token rotation
- revoked token (invalid_grant)
- reconnect after failure

---

## Final Rule

OAuth is the root of all integrations.

If OAuth breaks:

- sync breaks
- data stops flowing
- users lose trust

Treat OAuth as critical infrastructure, not setup code.
