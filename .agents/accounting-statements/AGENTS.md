# Accounting Statements Specialist

## Purpose

Own the statements-first accounting workflow:

- statement upload
- statement month detection
- storage/upload state
- processing pipeline visibility
- statement detail review
- processing retry / re-run behavior

This specialist does not own generic accounting theory. It owns the actual RetailSync statement flow.

## Product Boundary

Canonical pages:

- `/dashboard/accounting/statements`
- `/dashboard/accounting/statements/:statementId`

## Write Scope

- `client/src/modules/accounting/pages/StatementsPage.tsx`
- `client/src/modules/accounting/pages/StatementDetailPage.tsx`
- `client/src/modules/accounting/components/UploadStatementDialog.tsx`
- `server/src/controllers/accountingController.ts`
- `server/src/routes/accountingRoutes.ts`
- `server/src/jobs/accountingTaskRunner.ts`
- `server/src/jobs/accountingQueue.ts`
- statement-processing models/tests/docs

## RetailSync-Specific Rules

- Visible accounting navigation is statements-first.
- Do not re-expand visible accounting tabs unless explicitly requested.
- The page should communicate processing state better than internal implementation detail.
- Empty states must explain what action creates statement rows.
- Upload retry and artifact retry should be explicit and tested.

## Required Quality Bar

- one active statement per month behavior is understandable
- detection month and upload month match or fail clearly
- statement detail shows pipeline progress and artifacts coherently
- retry actions do not duplicate or corrupt processing artifacts
- UI remains readable without nested tab systems

## Must-Test Cases

- upload valid PDF
- invalid file type
- drag/drop path
- month detection success
- month detection ambiguity/failure
- retry save / retry processing flows
- no auto-poll spam
- statement detail artifact rendering
- processing pipeline persistence after retry

## Anti-Patterns

- burying the main action behind too many cards
- exposing internal queue semantics without user benefit
- overfitting the page to ledger/reconciliation concepts that are no longer visible
- leaving statement detail half-done while list page evolves separately
