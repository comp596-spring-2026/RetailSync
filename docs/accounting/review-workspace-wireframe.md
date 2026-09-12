# Statement Review Workspace Wireframe

Last updated: 2026-05-14

## Header
| Area | Content |
|---|---|
| Title | Statement Review |
| Subtitle | Dec 2025 · Example Bank Checking xxxx4417 |
| Alert | Validation or extraction warnings when present |
| Validation | Pass / Warning / Fail |
| Actions | Back · Refresh · Reprocess · Open Ledger Review · Complete Month |

## Summary Strip
| Review Queue | Ready To Post | Completed | Transfers | Checks | Validation |
|---|---|---|---|---|---|
| 112 | 0 | 0 | 7 | 44 | Warning |

## Workspace Tabs
| Tab | Purpose |
|---|---|
| Overview | summary, now/next, entries, month-close gates |
| Suggestions | review queue, approve/exclude, transfer resolution |
| Rules | soft/hard matching rule creation and reuse |
| File Manager | source PDF plus OCR/table/validation artifacts |

## Overview Panel
| Block | Content |
|---|---|
| Now / Next | current suggested action for the operator |
| Metrics | counts for entries, debits, credits, checks, unresolved items |
| Month-close gates | rows reviewed, no blocking extraction failures, no pending mandatory decisions |
| Pipeline timeline | extracting, structuring, checks queued, ready for review |

## Filter Bar
| Search | Section | Family | Status | Date From | Date To | Min | Max | Sort | Rows |
|---|---|---|---|---|---|---|---|---|---|

## Suggestions Review List
| Date | Description | Section / Type | Page | Review | Posting | Amount | Action |
|---|---|---|---|---|---|---|
| 12/03/2025 | Internet Transfer from SMALL BUSINESS CHECKING xxx3588 | Transfer / Electronic Credits | Pg 1 | Proposed | Not posted | +2,000.00 | Review |
| 12/09/2025 | IRS USATAXPYMT 225574360549665 | Tax / Electronic Debits | Pg 2 | Proposed | Not posted | -2,022.30 | Review |

## Expanded Row
| Field | Value |
|---|---|
| Source | Page 2 · Electronic Debits |
| Raw line | 12/09/2025 IRS USATAXPYMT 225574360549665 $2,022.30 |
| Current classification | Tax payment |
| Suggested action | Review, approve, or exclude |
| Related account | — |
| Proof | Open source |

## Review Modal
| Section | Content |
|---|---|
| Source proof | Page, section, raw line, original preview |
| Parsed values | date, amount, direction, family |
| Editable fields | category, vendor/customer, QB action, account mapping, transfer account |
| Actions | Save, Save & Next, Approve, Exclude |

## Check Card Grid
| Check # | Date | Amount | Page | Status | Confidence | Action |
|---|---|---|---|---|---|

## File Manager
| Viewer | Content |
|---|---|
| Source PDF | original uploaded statement |
| OCR Text | extracted statement text |
| OCR JSON | page text and detection metadata |
| Tables | transactions, checks-cleared, sections, extracted checks |
| Validation | report, evidence, processing summary |
