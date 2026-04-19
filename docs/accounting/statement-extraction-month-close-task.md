# RetailSync Task: Internal Statement Extraction and Month-Close Flow

## Goal

Build a fully internal statement-processing system for RetailSync that takes an uploaded monthly bank statement PDF, processes it asynchronously inside the application, stores all durable artifacts in the configured bucket, classifies extracted rows into business-useful categories, generates QuickBooks-ready suggestions, and allows the user to mark the month complete only after all extracted entries are resolved.

This must work in cloud deployment and must not require any external OCR service or external workflow/task engine.

## Product Outcome

The final user flow must be:

1. User uploads a monthly statement PDF.
2. RetailSync saves the PDF in bucket storage.
3. RetailSync creates or links a month-processing record.
4. RetailSync starts an internal async processing run.
5. The system extracts and parses statement data internally.
6. The system classifies extracted rows into operational categories.
7. The system writes durable processing artifacts to the bucket.
8. The system generates QuickBooks suggestions for the extracted rows.
9. The user reviews the month in a dedicated month-close workspace.
10. The user resolves all extracted entries and suggestions.
11. The user marks the month complete only when all completion gates pass.

## Locked Architecture Decisions

- Processing must be internal and asynchronous.
- The main review surface must be a month-close workspace, not a ledger-only workflow.
- QuickBooks behavior in this phase is suggestion-only.
- All durable artifacts must be stored in the bucket.
- The implementation must work in cloud deployments.
- The already saved statement PDF fixture must be used as the first implementation and validation target.
- No external OCR pipeline is allowed.
- No external task/workflow system is required.
- Reuse current accounting pages and flows wherever practical instead of replacing the whole frontend.
- Reuse the current check image review page or check artifact view pattern as the base review style for image-based evidence.
- Reuse the current check image grid style as the standard artifact grid pattern for statement-derived visual artifacts.

## Frontend Reuse Strategy

Do not rebuild the accounting UI from zero unless there is a hard blocker.

Reuse these existing concepts where practical:

- statements list page
- statement detail page
- upload dialog flow
- current artifact/evidence rendering patterns
- current check image page or check artifact page pattern
- current check image grid/card style for bucket-backed visual artifacts

Expected frontend migration approach:

- keep the current statement upload entrypoint
- keep the current statements landing surface
- evolve the current statement detail experience into a month-close workspace or wrap it with month-close sections
- preserve useful existing evidence/review components where possible
- avoid parallel duplicate pages if the current page can be upgraded cleanly

Specific instruction for image/evidence UX:

- use the current check image page pattern if it already provides a usable detailed evidence review surface
- use the current check image grid/card style for rendering:
  - check crops
  - deposit evidence thumbnails
  - page render thumbnails
  - extracted visual evidence sets
- keep the visual language consistent so users do not learn separate review patterns for checks versus other extracted artifacts

## Required Processing Stages

Implement the statement pipeline as internal staged processing with persisted progress:

- `statement_ingest`
- `statement_extract_text`
- `statement_extract_rows`
- `statement_classify_rows`
- `statement_generate_suggestions`
- `statement_finalize_artifacts`

Requirements for the pipeline:

- DB-backed run state
- idempotent stages
- retry support
- resumable processing
- safe multi-instance locking
- durable progress/error persistence
- no durable dependence on local filesystem paths

Temporary local processing files are allowed, but the durable source of truth must always be bucket-backed.

## Required Classification Output

Each extracted statement row must be classified into one of:

- `check`
- `deposit`
- `expense`
- `payment`
- `transfer`
- `fee`
- `adjustment`
- `unknown`

Each extracted row must capture:

- statement date
- posted date if available
- amount
- sign or direction
- raw description
- normalized description
- extracted payee/payer/counterparty if possible
- extracted check number if present
- classification
- confidence
- evidence references
- review state
- suggested QuickBooks action

## Required Suggestion Types

Generate internal QuickBooks suggestions for extracted entries. Suggestions are reviewable recommendations only and must not auto-create QuickBooks records in this phase.

Supported suggestion types:

- create check suggestion
- create expense suggestion
- create receive-payment suggestion
- create deposit suggestion
- create transfer suggestion
- link-to-existing entity/account suggestion
- ignore/non-posting suggestion

Each suggestion must include:

- source entry id
- suggested QuickBooks object type
- suggested fields
- confidence
- rationale
- review state

## Required Domain Model Direction

Target user-facing review should be month-centered.

Recommended entities:

- `BankStatement`
- `StatementMonth`
- `StatementMonthEntry`
- `StatementMonthSuggestion`
- `StatementMonthArtifact`
- processing run record

Expected roles:

- `BankStatement`: uploaded source document record
- `StatementMonth`: month-level review and close aggregate
- `StatementMonthEntry`: normalized extracted row
- `StatementMonthSuggestion`: QuickBooks suggestion record
- `StatementMonthArtifact`: artifact references
- processing run record: internal async stage tracking

Existing compatibility models may remain temporarily, but the target product workflow must be month-close centered.

## Required Artifact Storage Contract

All durable artifacts must be stored in the configured bucket under a deterministic statement/month prefix.

Required durable artifacts:

- original PDF
- rendered page images if used
- extracted text
- normalized rows JSON
- classification output JSON
- per-entry evidence output
- check-related extraction artifacts
- deposit-related extraction artifacts
- suggestion output
- processing summary JSON

Rules:

- bucket storage is the durable source of truth
- artifacts must survive worker restart and deploy restart
- downstream readers must use bucket paths as durable references
- local temp files must never be treated as durable source paths

## Required Month-Close UX

Build or reshape the frontend around a dedicated month-close workspace.

Required UI sections:

- month summary header
- processing timeline/status
- extracted entries table
- suggestion review panel
- artifact panel
- completion checklist
- close month action

Required UX behavior:

- upload leads into month workflow
- users see processing/review state clearly
- entries can be filtered by category, confidence, unresolved status
- suggestions are grouped and reviewable
- month close is blocked until all completion gates pass

Required reuse behavior:

- keep the current statements page as the discovery/entry surface
- keep the current upload flow
- prefer evolving the current statement detail page instead of inventing an unrelated new page tree
- preserve current artifact drill-in behavior if usable
- use the check image detail/grid presentation style as the shared visual artifact language

## Required Completion Gates

A month may only be marked complete when:

- every extracted row has been reviewed
- there are no blocking extraction failures
- there are no unresolved mandatory unknowns
- there are no pending mandatory suggestion decisions

## Required API Direction

Keep the current statement upload compatibility entrypoint if possible, but add or evolve month-close endpoints.

Target API surface:

- upload statement
- list months
- get month summary
- list month entries
- update month entry review state
- list month suggestions
- update suggestion review state
- reprocess month
- complete month

## Mandatory Fixture Requirement

There is already one saved statement PDF fixture available in the system/repo environment.

This fixture must be used as the first validation target.

Implementation is not complete until the system can:

- run the full pipeline against that saved PDF
- write the resulting artifacts to the bucket under normal storage layout
- produce extracted rows
- classify those rows
- generate suggestions
- expose the results in the month-close workflow
- enforce completion gates correctly

## Required Automated Tests

Implement automated coverage for:

- statement upload creates source record and month record
- internal processing run starts automatically
- each stage persists progress correctly
- bucket artifacts are written at every required stage
- fixture PDF produces extracted rows
- extracted rows are classified correctly
- suggestions are generated correctly
- retries do not duplicate derived rows or artifacts
- reprocess safely replaces derived outputs
- month cannot complete with unresolved blockers
- month completes when all rows are resolved
- worker restart or instance handoff resumes processing safely

Frontend-specific tests must also cover:

- current statements page still works as the entry surface
- upgraded statement detail or month-close view renders extracted entries correctly
- artifact thumbnails/cards reuse the check image grid behavior consistently
- artifact drill-in uses the existing check image detail-style interaction where appropriate

## Required Manual Validation

Using the saved fixture PDF, confirm:

- upload succeeds
- internal processing begins automatically
- artifacts appear in the bucket
- extracted entries are visible
- checks are identified correctly
- deposits are identified correctly
- unresolved rows are surfaced clearly
- suggestions are visible and editable
- image-based artifacts render with the reused check image grid/detail style
- month completion stays blocked until all required review work is done

## Implementation Constraints

- Do not depend on external OCR providers.
- Do not depend on external workflow/task orchestration.
- Do not use local-only durable storage assumptions.
- Keep the implementation cloud-safe.
- Keep the current page structure where practical and evolve it incrementally.
- Reuse the existing check image detail and grid UI pattern for visual artifact review.
- Prefer compatibility-preserving migration where current upload behavior already exists.
- Favor idempotent, resumable processing and explicit progress tracking.

## Definition of Done

This task is complete when:

- the saved statement fixture runs end to end through the new internal pipeline
- durable artifacts are stored in the bucket
- extracted rows are categorized and reviewable
- QuickBooks suggestions are generated and reviewable
- the month-close workspace is usable
- the current statement pages are evolved rather than unnecessarily duplicated
- image artifact review uses the existing check image page/grid pattern consistently
- completion gates work correctly
- the system works in cloud deployment without external OCR/task infrastructure
