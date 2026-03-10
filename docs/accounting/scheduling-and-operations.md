# Scheduling and Operations

This is the concrete runbook for scheduling daily sync and operating OCR + QuickBooks + Google Sheets flows.

## 1) What runs automatically

1. OCR pipeline:
   - Trigger: statement create (`POST /api/accounting/statements`).
   - Queue: `pipeline-ocr-*`.
   - Jobs: `statement.extract -> statement.structure -> checks.spawn -> check.process`.
2. Daily integration sync (new cron route):
   - Trigger: Cloud Scheduler call to `POST /api/cron/accounting-sync`.
   - Runs:
     - Google Sheets sync (`runSheetsSync`).
     - QuickBooks refresh + post-approved queue fan-out for all connected companies.
3. Manual sync options remain available:
   - `POST /api/integrations/quickbooks/sync/refresh-reference-data`
   - `POST /api/integrations/quickbooks/sync/post-approved`
   - `POST /api/cron/sync-sheets`

## 2) Required runtime config

Server env:

```env
TASKS_MODE=cloud
TASKS_QUEUE_PIPELINE=pipeline-ocr-dev
TASKS_QUEUE_SYNC=sync-integrations-dev
TASKS_OIDC_SERVICE_ACCOUNT_EMAIL=retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com
INTERNAL_TASKS_ENDPOINT=https://<worker-or-api-url>/api/tasks
INTERNAL_TASKS_SECRET=<same-secret-used-by-cron-and-task-caller>
GCP_PROJECT_ID=lively-infinity-488304-m9
GCP_REGION=us-west1
GCS_BUCKET_NAME=<bucket-name>
```

Service names used for ops links/debug:

```env
API_SERVICE_NAME=retailsync-api
WORKER_SERVICE_NAME=retailsync-worker-dev
```

## 3) Cloud resources checklist

1. Cloud Run service for API (`retailsync-api`).
2. Cloud Run service for worker target (`retailsync-worker-dev` in dev, `retailsync-worker` in prod) or API itself if single-service.
3. Cloud Tasks queues:
   - `pipeline-ocr-dev` / `pipeline-ocr-prod`
   - `sync-integrations-dev` / `sync-integrations-prod`
4. Cloud Scheduler job(s):
   - daily accounting sync
5. GCS bucket with write access for runtime service account.

## 4) Create daily scheduler jobs (dev/prod)

### Dev

```bash
gcloud scheduler jobs create http retailsync-accounting-daily-dev \
  --project=lively-infinity-488304-m9 \
  --location=us-west1 \
  --schedule="0 4 * * *" \
  --time-zone="America/New_York" \
  --uri="https://<dev-api-url>/api/cron/accounting-sync?includeSheets=true&includeQuickBooks=true&postDelaySeconds=120" \
  --http-method=POST \
  --headers="x-cron-secret=<CRON_SECRET>"
```

### Prod

```bash
gcloud scheduler jobs create http retailsync-accounting-daily-prod \
  --project=lively-infinity-488304-m9 \
  --location=us-west1 \
  --schedule="0 4 * * *" \
  --time-zone="America/New_York" \
  --uri="https://<prod-api-url>/api/cron/accounting-sync?includeSheets=true&includeQuickBooks=true&postDelaySeconds=120" \
  --http-method=POST \
  --headers="x-cron-secret=<CRON_SECRET>"
```

## 5) Manage and verify daily sync

1. Dry run:
   - `POST /api/cron/accounting-sync?dryRun=true`
2. Sheets-only run:
   - `POST /api/cron/accounting-sync?includeSheets=true&includeQuickBooks=false`
3. QuickBooks-only run:
   - `POST /api/cron/accounting-sync?includeSheets=false&includeQuickBooks=true`
4. Check status:
   - QuickBooks tab: `lastPull*`, `lastPush*`.
   - Observability tab: failed runs and log shortcuts.
   - Statement pages: OCR/check progress and failures.

## 6) Worker behavior in cloud mode

1. API enqueues tasks through Cloud Tasks API using:
   - `GCP_PROJECT_ID`
   - `GCP_REGION`
   - queue (`pipeline-ocr-*` or `sync-integrations-*`)
   - `TASKS_OIDC_SERVICE_ACCOUNT_EMAIL`
2. Task target URL is resolved from `INTERNAL_TASKS_ENDPOINT`:
   - base `/api/tasks` gets routed to `/pipeline` or `/sync` by job type.
3. Worker executes:
   - `/api/tasks/pipeline` for OCR/statement/check jobs.
   - `/api/tasks/sync` for QuickBooks sync jobs.
4. Task endpoints validate:
   - `x-internal-task-secret`
   - strict payload schema
   - job-type endpoint compatibility.

## 7) OCR + bucket artifact flow (current implementation)

1. Upload PDF to:
   - `companies/<companyId>/statements/<yyyy>/<mm>/<statementId>/original/statement.pdf`
2. `statement.extract` writes:
   - `derived/ocr/docai.json`
   - `derived/ocr/text.txt`
   - `derived/pages/page-###.png`
3. `statement.structure` writes:
   - `derived/gemini/normalized.v1.json`
   - statement transactions + ledger rows in Mongo.
4. `check.process` writes:
   - `derived/checks/extracted/<checkId>/ocr.json`
   - `derived/checks/extracted/<checkId>/structured.v1.json`
   - check evidence links patched into ledger.

Current check image crop behavior:
1. If dedicated check images are not available, placeholder images are generated.
2. Real PDF/image crop adapters can be added behind the same artifact paths without changing downstream models or UI.
