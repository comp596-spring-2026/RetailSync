# Accounting + QuickBooks + Observability Rollout Checklist

This checklist covers all required changes for GitHub, GCP, Cloud Run env, and QuickBooks OAuth so the accounting pipeline, QuickBooks sync jobs, and observability dashboard run correctly.

## 1) GitHub Repository Configuration

### Variables

- `WIF_PROVIDER` (required)
  - Workload Identity Provider resource path used by GitHub Actions deploy workflow.
- `CI_INTEGRATION=true` (optional)
  - Enables the integration-test job if your CI workflow uses it.

### Secrets

- `FIREBASE_TOKEN` (required for production branch deploy only)
  - Needed for client hosting deploy step on `production`.

## 2) GCP Secret Manager (Server Runtime)

Create/update these secrets in project `lively-infinity-488304-m9`:

### Required baseline secrets

- `MONGO_URI`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `ENCRYPTION_KEY`
- `CRON_SECRET`
- `INTERNAL_TASKS_SECRET`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_AUTH_REDIRECT_URI`
- `GOOGLE_INTEGRATION_REDIRECT_URI`

### QuickBooks OAuth secrets (required for QB connect/sync)

- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_INTEGRATION_REDIRECT_URI`

Notes:
- Deploy workflow injects QuickBooks secrets only when they exist.
- Callback URI must match Intuit app config exactly.

## 3) GCP IAM Roles

### CI service account (`retailsync-ci-sa@...`)

- `roles/run.admin`
- `roles/cloudbuild.builds.editor`
- `roles/artifactregistry.admin`
- `roles/iam.serviceAccountUser`
- `roles/secretmanager.secretAccessor`
- `roles/iam.workloadIdentityUser` binding from your GitHub repo principal set

### Runtime service account (`retailsync-run-sa@...`)

- `roles/cloudtasks.enqueuer`
- `roles/iam.serviceAccountTokenCreator`
- Any additional DB/storage access roles already required by your app

## 4) Cloud Run Environment Expectations

Deploy workflow now sets these env vars on API/worker:

- `TASKS_MODE` (`cloud` on API, `inline` on worker)
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GCS_BUCKET_NAME`
- `TASKS_QUEUE_PIPELINE`
- `TASKS_QUEUE_SYNC`
- `TASKS_OIDC_SERVICE_ACCOUNT_EMAIL`
- `INTERNAL_TASKS_ENDPOINT` (API only)
- `API_SERVICE_NAME`
- `WORKER_SERVICE_NAME`

Expected service names:

- Development:
  - API: `retailsync-api-dev`
  - Worker: `retailsync-worker-dev`
- Production:
  - API: `retailsync-api`
  - Worker: `retailsync-worker`

## 5) QuickBooks OAuth App Configuration (Intuit)

Add callback URIs in your Intuit app:

- Development callback:
  - `https://<dev-api-domain>/api/integrations/quickbooks/callback`
- Production callback:
  - `https://<prod-api-domain>/api/integrations/quickbooks/callback`

The URI configured in Intuit must equal `QUICKBOOKS_INTEGRATION_REDIRECT_URI`.

## 6) Post-Deploy Verification

### API checks

- `GET /health`
- `GET /health/env-readiness`
  - verify `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET`, `QUICKBOOKS_INTEGRATION_REDIRECT_URI`, `API_SERVICE_NAME`, `WORKER_SERVICE_NAME` are present where expected.

### App checks

- Open `/dashboard/accounting/quickbooks`
  - connect QuickBooks
  - refresh reference data
  - post approved entries
- Open `/dashboard/accounting/observability`
  - recent statements load
  - failed jobs list renders
  - debug diagnostics run
  - GCP log shortcut links open

Detailed accounting lifecycle + module docs:

- `/Users/trupal/Projects/RetailSync/docs/accounting/README.md`

## 7) Scheduler Verification

1. Configure daily scheduler:
   - `POST /api/cron/accounting-sync`
   - include header `x-cron-secret`
2. Smoke test with dry-run:
   - `POST /api/cron/accounting-sync?dryRun=true`
3. Confirm outputs:
   - response includes `sheets` summary and `quickbooks` per-company queue summary.
   - QuickBooks settings `lastPullStatus` / `lastPushStatus` move to `running` then final states.
4. Optional targeted runs:
   - sheets only: `?includeSheets=true&includeQuickBooks=false`
   - quickbooks only: `?includeSheets=false&includeQuickBooks=true`

## 8) Rollback

- Roll back Cloud Run traffic for API and worker to previous revisions.
- If needed, temporarily disable QB sync buttons via RBAC (`quickbooks.sync`) while investigating.
