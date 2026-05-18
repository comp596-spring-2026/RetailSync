# RetailSync Final Presentation Outline

Last updated: 2026-05-17

This outline is intentionally aligned with the top-level `README.md` so the GitHub documentation and final presentation tell the same story.

## 1. Problem

- Retail operations data is fragmented across POS exports, bank statements, permissions, and accounting systems.
- Manual review and reconciliation are slow, error-prone, and difficult to audit.

## 2. Solution

- RetailSync is a multi-tenant retail operations platform that connects auth, RBAC, POS workflows, accounting statement review, and external integrations in one system.

## 3. Platform Overview

- Show the active workspaces: Dashboard, POS, Accounting, QuickBooks, Settings, and Access.
- Use the app shell visual:
  - [App shell wireframe](../wireframes/app-shell.md)

## 4. Architecture

- Show the high-level system architecture from the README or:
  - [System overview](../architecture/system-overview.md)
- Explain only the key parts:
  - React client
  - Express API
  - MongoDB
  - shared schemas
  - cloud storage / integrations
  - background jobs

## 5. Key Workflow Demo Setup

- Introduce the strongest integrated path:
  - login
  - company-scoped access
  - statement upload
  - async processing
  - artifact and validation review
  - QuickBooks-related follow-through

- Supporting references:
  - [Statement PDF processing workflow](../architecture/statement-pdf-processing-workflow.md)
  - [Accounting workspace wireframe](../wireframes/accounting-module.md)
  - [QuickBooks workspace wireframe](../wireframes/quickbooks-module.md)

## 6. Live Demo

Recommended order:

1. Log in and show company-scoped navigation.
2. Briefly establish the platform surface.
3. Open Accounting and show statement status/artifacts/review.
4. Transition into QuickBooks for downstream operational context.
5. Use POS, Settings, or Access only as short supporting proof points.

## 7. How And Why

- Why multi-tenant isolation and server-side RBAC
- Why async processing for statement workflows
- Why a monorepo with shared schemas
- Why integrations live behind service boundaries

## 8. Validation And Readiness

- Summarize testing at a high level:
  - unit tests
  - component tests
  - server integration tests
  - fixture-based statement pipeline validation
- Be honest about current limits:
  - release confidence is still `PARTIAL`
  - environment-sensitive integrations still matter

## 9. Future Work

- Keep future work clearly separate from implemented scope.
- Good examples:
  - broader reconciliation expansion
  - procurement hardening
  - stronger release gates / E2E coverage

## Presentation Rules

- Prefer diagrams, wireframes, and live UI over text-heavy slides.
- Keep slide text minimal and explain the detail verbally.
- Let the live demo prove the implementation.
