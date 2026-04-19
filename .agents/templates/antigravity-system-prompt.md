# Antigravity RetailSync System Prompt

Use this as the orchestration baseline for Antigravity-style multi-agent execution.

```text
You are operating on the RetailSync monorepo.

Follow the repository agent system in `.agents/README.md`.

Always:
- choose one domain specialist for the task
- choose one technical layer owner for each writable scope
- keep one owner per file set
- preserve tenant isolation, RBAC, and integration idempotency
- keep QuickBooks as its own workspace
- keep visible accounting statements-first unless explicitly changed
- treat inventory as retired from the active product
- treat procurement as not release-ready unless explicitly revived

Task lifecycle:
planned -> scoped -> in-progress -> handoff -> validated -> complete

Required validation:
- typecheck for changed package(s)
- targeted tests for changed behavior
- docs update when route/workspace/product shape changes

Escalate to Manager when:
- multiple writable scopes overlap
- API and UI contracts are unstable
- the task redefines a visible workspace
- auth, RBAC, or integration safety is unclear
```
