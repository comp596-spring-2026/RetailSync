# Sprint Commit Policy

## Objective

Guarantee traceability from ticket -> code -> release.

## Required Commit Cadence

### During sprint
- Commit after each completed ticket.
- Reference ticket ID in commit message.

Format:

```text
S<SPRINT>-<TICKET>: <short change summary>
```

Examples:
- `S1-1: add tenantQuery helper and migrate item/location controllers`
- `S2-6: add playwright smoke for register->onboarding->dashboard`

### Sprint close
- One sprint-close summary commit updating:
  - `status.md`
  - sprint plan statuses
  - unresolved blockers

Format:

```text
Sprint <N> close: <summary>
```

## PR Mapping

Every PR must include:
- sprint number
- ticket IDs covered
- test evidence
- rollback notes for risky changes

## Required Artifacts at Sprint End

1. Updated `status.md`
2. Updated `docs/roadmap/sprints/sprint-plan.md`
3. CI run link(s)
4. If infra changed: compose/docker verification evidence

## Failure Policy

A ticket is not closed if one of these is missing:
- tests for new behavior
- tenant isolation checks
- RBAC checks
- docs update for changed behavior
