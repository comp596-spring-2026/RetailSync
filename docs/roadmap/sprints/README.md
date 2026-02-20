# Sprint Planning Execution Pack

This folder contains the official sprint-by-sprint delivery plan for RetailSync.

## Sprint Order

1. Sprint 1: Multi-tenant + security hardening
2. Sprint 2: Tests + CI gates + Docker reliability
3. Sprint 3: Invoice OCR scaffolding + ingestion pipeline
4. Sprint 4: Invoice module hardening + release readiness
5. Sprint 5: Bank ingestion + transaction modeling
6. Sprint 6: Reconciliation engine + payment allocation

## Operating Rules

- Each sprint has:
  - explicit tickets
  - acceptance criteria
  - required tests
  - DoD checklist
- No sprint marked complete until all blocking tickets are complete.
- Every merged ticket must map to a commit.
- At sprint close, create one sprint summary commit.

## Commit Convention Per Sprint

Use commit prefix by sprint:

- `S1:` for Sprint 1
- `S2:` for Sprint 2
- `S3:` for Sprint 3
- `S4:` for Sprint 4
- `S5:` for Sprint 5
- `S6:` for Sprint 6

Example:

```bash
git commit -m "S1: enforce tenant aggregate guard for inventory and items"
```

Sprint-close commit format:

```bash
git commit -m "Sprint 1 close: tenant isolation + auth hardening complete"
```
