# CI/CD Pipeline (Production)

This project uses two GitHub Actions workflows:

- CI gate: `.github/workflows/ci-production.yml`
- Release images: `.github/workflows/release-images.yml`

## CI Gate Workflow

Triggers:

- pull requests to any branch
- pushes to `main`, `develop`, `release/**`, `hotfix/**`

Gates (all required):

1. `quality`
   - `pnpm typecheck`
   - `pnpm lint`
2. `tests`
   - `pnpm test`
   - isolates `mongodb-memory-server` cache per job and clears stale lock files
3. `build`
   - `pnpm build`
   - uploads build artifacts
4. `final-status`
   - fails if any prior gate failed

```mermaid
flowchart TD
  PR[PR or Push] --> Q[Quality]
  Q --> T[Tests]
  Q --> B[Build]
  T --> F[Final Status]
  B --> F
```

## Release Workflow

Triggers:

- manual run only (`workflow_dispatch`)

Behavior:

- logs into GHCR with `GITHUB_TOKEN`
- builds and pushes:
  - `ghcr.io/<owner>/retailsync-server`
  - `ghcr.io/<owner>/retailsync-client`
- tags include:
  - `sha-...`
  - `latest` (main only)
  - git tag ref (for tag pushes)

## Required Branch Protection Rules

Set on `main`:

- Require pull request before merge
- Require status checks to pass
  - `Typecheck + Lint`
  - `Test Suite`
  - `Build Artifacts`
  - `Final CI Status`
- Require conversation resolution
- Restrict force-push and branch deletion

## Recommended Repository Settings

1. Actions permissions:
   - Workflow permissions: `Read and write`
2. Package permissions:
   - allow GitHub Actions to publish packages when running release workflow
3. Dependabot alerts enabled
4. Secret scanning enabled

## Operational Playbook

### PR validation

- open PR -> CI gate runs automatically
- fix failing job
- merge only after all gates pass

### Production image release

- manually trigger `Release Docker Images` workflow when image publishing is needed
- workflow publishes `sha` tags and `latest` when run against `main`

### Rollback strategy

- pull previous `sha-...` image from GHCR
- redeploy server/client with pinned image tags

```mermaid
sequenceDiagram
  participant Dev as Developer
  participant GH as GitHub Actions
  participant CR as GHCR
  participant Env as Runtime Environment

  Dev->>GH: Merge PR
  GH->>GH: Run CI gates
  Dev->>GH: Manually trigger release workflow (when needed)
  GH->>CR: Push server/client images
  Env->>CR: Pull latest or pinned sha image
  Env->>Env: Deploy
```
