# PR Title

<!--
Format recommendation:
<type>(<scope>): <summary>
Example: feat(inventory): add location stock aggregation endpoint
-->

## 1) Summary

### What changed

<!-- Clear, concise explanation of what was implemented. -->

### Why this change is needed

<!-- Business or technical reason. Link incidents/issues if relevant. -->

### Scope boundary

<!-- Explicitly call out what is intentionally NOT included in this PR. -->

## 2) Change Type

- [ ] `feat` New feature
- [ ] `fix` Bug fix
- [ ] `refactor` Code restructuring without behavior change
- [ ] `perf` Performance improvement
- [ ] `security` Security-related change
- [ ] `docs` Documentation-only change
- [ ] `chore` Build/tooling/maintenance
- [ ] `test` Test-only change

## 3) Linked Work

- Issue:
- Spec/Doc:
- Incident/Alert:
- Related PRs:

## 4) Architecture and Design Impact

### Affected layers

- [ ] `shared` schemas/types/modules/actions
- [ ] `server` API/controllers/middleware/models
- [ ] `client` routes/state/components
- [ ] `infra` Docker/CI/CD/runtime config
- [ ] `docs` runbook/architecture/API docs

### Design notes

<!-- Summarize key design decisions and trade-offs. -->

### Mermaid / diagrams updated

- [ ] Added/updated diagrams in docs (if architecture/flow changed)
- Diagram file(s):

## 5) Multi-Tenant Safety Checklist (Required)

- [ ] Every new tenant data model includes `companyId`
- [ ] Every read query is scoped by `companyId`
- [ ] Every write/update/delete query is scoped by `companyId`
- [ ] No cross-tenant lookup path exists
- [ ] `requireAuth` path is used before tenant-sensitive handlers

### Tenant scoping evidence

<!-- Paste code references with file:line, e.g. server/src/controllers/x.ts:42 -->

## 6) RBAC and Security Checklist (Required)

- [ ] All protected endpoints enforce `requirePermission(module, action)`
- [ ] Correct module/action mapping used (CRUD + custom actions)
- [ ] Client hides/disables unauthorized UI elements
- [ ] Direct URL/server-side bypass is not possible
- [ ] JWT/cookie handling unchanged OR changes documented
- [ ] No sensitive secrets/tokens logged

### RBAC mapping changed in this PR

<!-- If changed, document module + actions added/removed and defaults impact. -->

## 7) API Contract Changes

- [ ] No API changes
- [ ] Backward-compatible API changes
- [ ] Breaking API changes (requires migration/coordination)

### Endpoints added/changed

| Method | Path | Auth | Permission | Request Schema | Response Schema |
|---|---|---|---|---|---|
|  |  |  |  |  |  |

### Error contract

- [ ] Uses standard error shape: `{ status: "error", message, details? }`
- [ ] Validation errors return `422`
- [ ] Auth failures return `401`
- [ ] Permission failures return `403`

## 8) Data Model / Migration Impact

- [ ] No schema/index changes
- [ ] Schema/index changes included
- [ ] Data migration required

### Models changed

- Collection(s):
- New/changed fields:
- New/changed indexes:
- Backfill plan:
- Rollback plan:

## 9) Frontend Impact

- [ ] Route changes
- [ ] Redux store changes
- [ ] Permission-gated UI changes
- [ ] Form validation changes
- [ ] No frontend impact

### Screens impacted

<!-- List routes/pages and what changed. -->

## 10) Testing Evidence (Required)

### Automated tests added/updated

- [ ] Unit tests
- [ ] Integration tests
- [ ] E2E tests
- [ ] No new tests (explain why)

### Commands run locally

<!-- Paste exact commands and concise output summary -->

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `docker compose config`
- [ ] `docker compose build` (if Docker touched)

### Test results summary

<!-- Example: all passed / list failing test names and reason -->

## 11) Observability and Operations

- [ ] Logs meaningful and non-sensitive
- [ ] Metrics/telemetry impacted (documented)
- [ ] Healthchecks remain valid
- [ ] Runbook updated in `/docs/operations`

### Operational notes

<!-- Anything ops/on-call should know before merge/deploy -->

## 12) Performance Considerations

- [ ] No expected perf impact
- [ ] Query or render path changed (details below)

### Perf notes

<!-- Mention heavy queries, new indexes, batching, pagination, etc. -->

## 13) Security Review Notes

- [ ] Input validated with Zod (or justified alternative)
- [ ] File uploads validated/safe-handled (if applicable)
- [ ] Dependency risk reviewed (`pnpm audit`)
- [ ] No new privileged endpoints without strict permission checks

### Security-specific testing done

<!-- Include abuse-case checks performed. -->

## 14) Deployment Plan

### Rollout strategy

- [ ] Normal rollout
- [ ] Feature-flagged rollout
- [ ] Dark launch / partial rollout

### Preconditions

<!-- Env vars, infra dependencies, sequence constraints -->

### Post-deploy verification

- [ ] Auth flow (`register/login/refresh/logout`)
- [ ] Onboarding (`create/join company`)
- [ ] RBAC visibility + endpoint enforcement
- [ ] Critical module smoke test
- [ ] Health endpoint and logs clean

## 15) Rollback Plan (Required)

- Trigger to rollback:
- Exact rollback steps:
- Data consistency considerations after rollback:

## 16) Reviewer Checklist

- [ ] Code is understandable and maintainable
- [ ] Multi-tenant and RBAC checks are complete
- [ ] Tests are adequate for risk level
- [ ] Docs are updated and accurate
- [ ] Deployment/rollback plans are actionable

## 17) Screenshots / Evidence

<!-- UI/API screenshots, logs, traces, before/after if helpful -->

