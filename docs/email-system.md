# Email System Debug Guide

## Current flow

1. `POST /api/auth/register` creates email verification OTP (`123-456`) and sends email.
2. `POST /api/auth/forgot-password` creates reset OTP (`123-456`) and sends email.
3. `POST /api/auth/verify-email` validates user-entered OTP against hashed stored token.
4. `POST /api/auth/reset-password` validates user-entered OTP against hashed stored token.

OTP values are stored hashed (`sha256`) in MongoDB. The raw code is only in email content.

## Required environment

Server requires:

- `RESEND_API_KEY`
- `RESEND_FROM`
- `CLIENT_URL` (used by branded template fallback icon URL)

For development, use:

- `RESEND_FROM=RetailSync <onboarding@resend.dev>`

For production, verify your domain in Resend and set:

- `RESEND_FROM=RetailSync <no-reply@yourdomain.com>`

## Why delivery fails

If you see:

`You can only send testing emails to your own email address ... verify a domain ...`

then your Resend account/domain is not approved for sending to arbitrary recipients yet.

## API behavior when email fails

- API returns `status: "ok"` for anti-enumeration/user privacy.
- In non-production, response includes `emailDebug` with provider error detail.
- UI will not advance to reset page if `emailDebug` exists.

## Tests

Email transport unit tests:

- `server/src/services/emailService.test.ts`

Auth OTP end-to-end flow tests:

- `server/src/auth.account-recovery.e2e.test.ts`

Run:

```bash
pnpm --filter @retailsync/server test -- emailService.test.ts
pnpm --filter @retailsync/server test -- auth.account-recovery.e2e.test.ts
```

Note: the auth E2E suite uses `mongodb-memory-server`, which may require CI/local environment support for ephemeral ports and Mongo binaries.

