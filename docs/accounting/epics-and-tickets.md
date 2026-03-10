# Epic and Ticket Structure (Accounting)

This is the structured backlog view for module-by-module execution and regression control.

## 1) Epic map by module

| Epic | Module | Goal |
| --- | --- | --- |
| ACC-E1 | Cross-cutting contracts | migrate to new accounting schema/model set |
| ACC-E2 | Statements | deterministic artifact lifecycle in GCS |
| ACC-E3 | Statements + worker | async pipeline orchestration |
| ACC-E4 | OCR/Gemini | strict extraction/structuring adapters |
| ACC-E5 | Ledger/matching | explainable proposal engine |
| ACC-E6 | Statements tab | progressive processing workspace |
| ACC-E7 | Ledger tab | canonical review and approve flow |
| ACC-E8 | QuickBooks Sync tab | reliable approval-only sync |
| ACC-E9 | Observability tab | run/debug visibility and safe retries |
| ACC-E10 | Quality gate | enforce end-to-end test confidence |

## 2) Detailed epics and subtickets

### ACC-E1: Domain Migration and Contracts

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E1-T1 | shared accounting schemas/enums | all accounting endpoints compile against new contracts | schema unit tests |
| ACC-E1-T2 | new models (`StatementTransaction`, `StatementCheck`, `Run`) | indexes and enum constraints active | model schema tests |
| ACC-E1-T3 | rework `BankStatement` + `LedgerEntry` | old status/field dependencies removed | migration fixture tests |
| ACC-E1-T4 | migration script | dry-run and apply both supported, idempotent behavior | migration integration tests |
| ACC-E1-T5 | remove legacy flow paths | no old accounting route contracts in active clients | route regression tests |

### ACC-E2: GCS Storage and Artifact Lifecycle

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E2-T1 | deterministic path generator | all writes stay under statement root prefix | unit tests |
| ACC-E2-T2 | upload endpoint hardening | signed URL content type/path validation enforced | controller tests |
| ACC-E2-T3 | artifact writer service | each worker stage writes expected artifacts | integration tests with mocked GCS |
| ACC-E2-T4 | dedupe hashing | duplicate hash surfaces warning issue | dedupe tests |

### ACC-E3: Pipeline Orchestration

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E3-T1 | `/api/tasks/pipeline` auth/router | job type filtering and payload validation enforced | route auth/validation tests |
| ACC-E3-T2 | `statement.extract` worker | artifacts written and status transitions correct | worker integration tests |
| ACC-E3-T3 | `statement.structure` worker | transaction + ledger upserts complete | persistence tests |
| ACC-E3-T4 | `checks.spawn` fanout | check counts and queue fanout deterministic | fanout tests |
| ACC-E3-T5 | `check.process` parallel logic | independent check state changes and ledger patching | per-check lifecycle tests |
| ACC-E3-T6 | failure semantics | failed runs/checks reflected and recoverable | retry/failure tests |

### ACC-E4: OCR/Vision/Gemini Integration

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E4-T1 | OCR adapter contract | provider outputs normalized envelope | adapter tests |
| ACC-E4-T2 | statement structuring parser | strict schema validation/fallback handling | parser tests |
| ACC-E4-T3 | check parser | field confidence extracted and persisted | parser tests |
| ACC-E4-T4 | prompt/audit persistence | prompt/output artifacts stored under gemini path | artifact tests |

### ACC-E5: Matching Engine

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E5-T1 | hard rules | configurable merchant/payee rule hits | rule tests |
| ACC-E5-T2 | entity resolution | fuzzy payee resolution with score | matching tests |
| ACC-E5-T3 | historical reuse | previous approvals influence score | similarity tests |
| ACC-E5-T4 | fallback model usage | fallback only below threshold | gating tests |
| ACC-E5-T5 | score composer | deterministic confidence + reasons output | unit tests |
| ACC-E5-T6 | proposal persistence mirror | ledger + transaction proposals stay aligned | integration tests |

### ACC-E6: Statements Tab Rebuild

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E6-T1 | statement list and counters | statuses/counters update while active processing | UI tests |
| ACC-E6-T2 | statement detail timeline | checks view + issue panel + actions functional | UI integration tests |
| ACC-E6-T3 | check cards | confidence/autofill/reasons rendered from API | interaction tests |
| ACC-E6-T4 | retry UX | failed check retry transitions visible | API + UI tests |
| ACC-E6-T5 | realtime update strategy | polling and SSE endpoint compatibility verified | realtime tests |

### ACC-E7: Ledger Tab Canonical Review

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E7-T1 | list/filter contract | all query filters return correct subset | query tests |
| ACC-E7-T2 | evidence display | attachments/proposal reasons visible per row | UI tests |
| ACC-E7-T3 | row action transitions | approve/edit/exclude guards enforced | transition tests |
| ACC-E7-T4 | bulk approve | atomic bulk update with excluded/posted guards | transactional tests |
| ACC-E7-T5 | post-approved trigger | queue dispatch and feedback complete | controller tests |

### ACC-E8: QuickBooks Posting and Sync

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E8-T1 | reference sync | accounts/entities cached and pull status updated | sync tests |
| ACC-E8-T2 | typed mapper | Expense/Deposit/Transfer/Check mapping correct | mapper tests |
| ACC-E8-T3 | journal fallback | unsupported typed case still posts via journal | fallback tests |
| ACC-E8-T4 | idempotent posting | rerun skips rows with `qbTxnId` | idempotency tests |
| ACC-E8-T5 | sync UI operations | connection/sync status/actions exposed | UI tests |
| ACC-E8-T6 | `/api/tasks/sync` endpoint | secure sync orchestration parity with pipeline | endpoint tests |

### ACC-E9: Observability and Operations

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E9-T1 | summary/debug APIs | counts, failed runs, env readiness returned | controller tests |
| ACC-E9-T2 | stale/failure surfacing | failed runs and issues visible in UI | observability tests |
| ACC-E9-T3 | retry operations | safe retry entry points for failed jobs/checks | retry tests |
| ACC-E9-T4 | runbook and deploy docs | queue/env/secret docs aligned with runtime | docs checklist |

### ACC-E10: End-to-End Quality Gate

| Ticket | Scope | Acceptance Criteria | Test |
| --- | --- | --- | --- |
| ACC-E10-T1 | backend unit coverage | pipeline/matching/sync behaviors deterministic | vitest unit suite |
| ACC-E10-T2 | backend integration flow | upload -> process -> review -> approve -> post | supertest/vitest integration |
| ACC-E10-T3 | frontend accounting tabs | Statements/Ledger/QB/Observability main paths | RTL/Vitest suite |
| ACC-E10-T4 | failure-path E2E | OCR fail, schema fail, QB errors, duplicate guard | E2E failure suite |
| ACC-E10-T5 | non-functional | concurrency/retry/idempotency under duplicate triggers | load/chaos scripts |

## 3) Delivery sequencing by tab

1. Phase 1: ACC-E1 + ACC-E2 + ACC-E3 + Statements tab feature flag.
2. Phase 2: ACC-E4 + ACC-E5 + Ledger tab feature flag.
3. Phase 3: ACC-E8 + QuickBooks posting feature flag.
4. Phase 4: ACC-E9 + ACC-E10 + final hardening and release checks.
