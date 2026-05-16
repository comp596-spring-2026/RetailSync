# RetailSync Skills

These are repo-local workflow skills meant to complement the agent files.

Use a skill when the task is not just “who owns this code,” but also “what repeated workflow should be followed.”

## Available Skills

- `auth-onboarding-workflow.md`
- `rbac-and-route-alignment.md`
- `pos-sheets-mapping-workflow.md`
- `statement-processing-workflow.md`
- `quickbooks-workspace-workflow.md`
- `release-readiness-workflow.md`

## How To Use

### With Codex

Reference the agent plus the skill:

```text
Use .agents/auth-onboarding/AGENTS.md and .agents/skills/auth-onboarding-workflow.md.
```

### With Cursor

Mention both in the prompt so the model follows the project workflow, not just the file glob rule.

### With Antigravity

Pair:

- one agent
- one skill
- one writable scope

## Skill Design Principle

Each skill defines:

- when it should be used
- workflow phases
- must-check edge cases
- validation
- common RetailSync anti-patterns
