# RetailSync CI/CD Operations Checklist

## Required GitHub repository secrets and variables

- Secret: `FIREBASE_TOKEN`
- Variable (optional, enables integration test job in CI): `CI_INTEGRATION=true`

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
gcloud iam workload-identity-pools providers describe github-provider --workload-identity-pool=github-pool --location=global --project=1039263569810
```

```bash
gcloud iam service-accounts add-iam-policy-binding retailsync-ci-sa@lively-infinity-488304-m9.iam.gserviceaccount.com --project lively-infinity-488304-m9 --role roles/iam.workloadIdentityUser --member "principalSet://iam.googleapis.com/projects/1039263569810/locations/global/workloadIdentityPools/github-pool/attribute.repository/comp596-spring-2026/RetailSync"
```

## Integration tests locally

- Unit/default tests: `pnpm -r --if-present test`
- Integration-only tests (server): `pnpm --filter @retailsync/server test:integration`
- If you intentionally want integration tests against a real Mongo instance, export `MONGO_URI` first and run: `MONGO_URI="mongodb://127.0.0.1:27017/retailsync-dev" pnpm --filter @retailsync/server test:integration`

## Cloud Run rollback

```bash
gcloud run revisions list --service retailsync-api --region us-central1 --project lively-infinity-488304-m9
```

```bash
gcloud run services update-traffic retailsync-api --region us-central1 --project lively-infinity-488304-m9 --to-revisions REVISION_NAME=100
```
