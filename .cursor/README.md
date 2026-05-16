# RetailSync Cursor Rules

This folder contains Cursor rule files tailored to the current RetailSync architecture.

## How to use these rules well

Cursor works best in this repo when prompts explicitly reference:

1. one domain specialist from `.agents/`
2. one layer owner from `.agents/`
3. one workflow skill from `.agents/skills/` when the task is repeated or complex

Example:

```text
Use .agents/quickbooks/AGENTS.md, .agents/frontend/AGENTS.md, and .agents/skills/quickbooks-workspace-workflow.md.

Improve the QuickBooks Contacts page without changing backend behavior.
```

## Rule categories

### Always-on workflow rules

- `retailsync-e2e-workflow.mdc`

This is the main coordination rule.

### Layer ownership rules

- `retailsync-frontend.mdc`
- `retailsync-backend.mdc`
- `retailsync-database.mdc`
- `retailsync-integrations.mdc`
- `retailsync-tester.mdc`

### Domain specialist rules

- `retailsync-auth-onboarding.mdc`
- `retailsync-access-rbac.mdc`
- `retailsync-pos-sheets.mdc`
- `retailsync-accounting-statements.mdc`
- `retailsync-quickbooks-specialist.mdc`
- `retailsync-settings-integrations.mdc`
- `retailsync-app-shell-navigation.mdc`
- `retailsync-release-docs.mdc`
- `retailsync-shared-contracts.mdc`
- `retailsync-security-tenancy.mdc`
- `retailsync-ci-release.mdc`

### UI rules

- `retailsync-ui-ux.mdc`

Use this as a visual consistency rule, not as permission to ignore product hierarchy.

## Current best prompt pattern

### Small UI task

```text
Use .agents/access-rbac/AGENTS.md, .agents/frontend/AGENTS.md, and .agents/skills/rbac-and-route-alignment.md.
```

### Backend bug

```text
Use .agents/accounting-statements/AGENTS.md, .agents/backend/AGENTS.md, and .agents/tester/AGENTS.md.
```

### Cross-cutting task

```text
Use .agents/manager/AGENTS.md first.
Then route to the right specialists and layer owners.
```

## Important project guardrails

- Inventory is retired.
- Procurement is not release-ready.
- QuickBooks is standalone.
- Accounting is statements-first.

If a Cursor answer drifts from those truths, point it back to:

- `.agents/PROJECT-TRUTH.md`
- `.agents/README.md`
