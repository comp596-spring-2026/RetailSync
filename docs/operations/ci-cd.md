# RetailSync CI/CD Operations Checklist

## Required GitHub repository secrets and variables

- Variable: `WIF_PROVIDER` (Workload Identity Provider resource path)
- Secret: `FIREBASE_TOKEN` (required for production client deploy only)
- Secret in Secret Manager: `INTERNAL_TASKS_SECRET`
- Optional secrets in Secret Manager for QuickBooks OAuth:
  - `QUICKBOOKS_CLIENT_ID`
  - `QUICKBOOKS_CLIENT_SECRET`
  - `QUICKBOOKS_INTEGRATION_REDIRECT_URI`
- Optional variable (enables integration test job in CI): `CI_INTEGRATION=true`

## WIF setup (one-line commands)

```bash
gcloud iam service-accounts create retailsync-ci-sa --project lively-infinity-488304-m9
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/run.admin"
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/cloudbuild.builds.editor"
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/artifactregistry.admin"
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/iam.serviceAccountUser"
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/cloudtasks.enqueuer"
```

```bash
gcloud projects add-iam-policy-binding lively-infinity-488304-m9 --member="serviceAccount:retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator"
```

```bash
gcloud iam workload-identity-pools providers describe github-provider --workload-identity-pool=github-pool --location=global --project=1039263569810
```

```bash
gcloud iam service-accounts add-iam-policy-binding retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com --project lively-infinity-488304-m9 --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/projects/1039263569810/locations/global/workloadIdentityPools/github-pool/attribute.repository/comp596-spring-2026/RetailSync"
```

## Deploy behavior by branch

- Push to `development`: deploys `retailsync-api-dev` + `retailsync-worker-dev`
- Push to `production`: deploys `retailsync-api` + `retailsync-worker` and Firebase Hosting client
- Cloud Tasks queues are auto-created/updated by workflow:
  - `pipeline-ocr-dev` / `sync-integrations-dev`
  - `pipeline-ocr-prod` / `sync-integrations-prod`
- Current worker endpoint security model:
  - Cloud Run worker is publicly reachable
  - `/api/internal/tasks/run` is protected with `x-internal-task-secret`
- Deploy workflow includes QuickBooks env wiring only when the corresponding secrets exist.
- Deploy workflow also injects `API_SERVICE_NAME` and `WORKER_SERVICE_NAME` for observability log shortcuts.

Full rollout checklist: `/Users/trupal/Projects/RetailSync/docs/operations/accounting-observability-rollout.md`

## Integration tests locally

- Unit/default tests: `pnpm -r --if-present test`
- Integration-only tests (server): `pnpm --filter @retailsync/server test:integration`
- If you intentionally want integration tests against a real Mongo instance, export `MONGO_URI` first and run: `MONGO_URI="mongodb://127.0.0.1:27017/retailsync-dev" pnpm --filter @retailsync/server test:integration`

## Cloud Run rollback

```bash
gcloud run revisions list --service retailsync-api --region us-west1 --project lively-infinity-488304-m9
```

```bash
gcloud run services update-traffic retailsync-api --region us-west1 --project lively-infinity-488304-m9 --to-revisions REVISION_NAME=100
```

```bash
gcloud run revisions list --service retailsync-worker --region us-west1 --project lively-infinity-488304-m9
```

```bash
gcloud run services update-traffic retailsync-worker --region us-west1 --project lively-infinity-488304-m9 --to-revisions REVISION_NAME=100
```
