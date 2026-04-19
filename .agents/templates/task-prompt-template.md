# RetailSync Task Prompt Template

Use this when assigning work to any agent system.

## Template

```text
Use .agents/<domain-or-layer>/AGENTS.md.

Project: RetailSync
Goal:
<one-sentence goal>

Business context:
<why this matters in the active product>

Writable scope:
- <exact directories or files>

Read-only context:
- <exact directories or files>

Constraints:
- preserve tenant isolation
- preserve RBAC
- do not reintroduce hidden/retired product areas
- keep QuickBooks as a standalone workspace when relevant
- keep statements-first accounting when relevant

Acceptance criteria:
- <criterion 1>
- <criterion 2>
- <criterion 3>

Validation:
- typecheck
- targeted tests
- docs update if route/workspace/product shape changes
```

## Example

```text
Use .agents/quickbooks/AGENTS.md and .agents/frontend/AGENTS.md.

Project: RetailSync
Goal:
Improve the QuickBooks accounts page so it feels like a real operations page instead of a thin list.

Business context:
Operators need a readable chart-of-accounts workspace with clear drill-ins and better register navigation.

Writable scope:
- client/src/modules/quickbooks/**
- client/src/modules/accounting/pages/QuickBooksChartOfAccountsPage.tsx

Read-only context:
- server/src/controllers/quickbooksTaxController.ts
- docs/wireframes/quickbooks-module.md

Acceptance criteria:
- accounts page has clearer hierarchy
- register drill-in still works
- no route regressions

Validation:
- pnpm --dir client exec tsc -p tsconfig.json --noEmit
- targeted QuickBooks page tests
```
