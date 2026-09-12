import { describe, expect, it } from 'vitest';
import type { BankStatementDetail, StatementTransaction } from '@retailsync/shared';
import { buildStatementOverview } from './statementOverviewModel';

const baseStatement = {
  id: 'stmt-1',
  statementMonth: '2025-12',
  fileName: 'statement.pdf',
  source: 'upload',
  status: 'ready_for_review',
  progress: {
    phase: 'ready_for_review',
    totalChecks: 0,
    checksQueued: 0,
    checksProcessing: 0,
    checksReady: 0,
    checksFailed: 0,
    completedChecks: 0,
    remainingChecks: 0
  },
  issuesCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  bankName: 'Example Bank',
  accountLast4: '4417',
  periodEnd: '2025-12-31',
  gcs: { rootPrefix: 'r', pdfPath: 'r/original.pdf' },
  checks: [],
  issues: []
} as BankStatementDetail;

const txn = (partial: Partial<StatementTransaction>): StatementTransaction => ({
  id: partial.id ?? 't1',
  statementId: 'stmt-1',
  companyId: 'c1',
  postDate: partial.postDate ?? '2025-12-01',
  description: partial.description ?? 'DEPOSIT',
  amount: partial.amount ?? 100,
  type: partial.type ?? 'credit',
  classification: 'unknown',
  isPostingCandidate: partial.isPostingCandidate ?? true,
  reviewStatus: 'proposed',
  posting: { status: 'not_posted' },
  ...partial
});

describe('buildStatementOverview', () => {
  it('builds sections from extracted rows without hardcoded bank values', () => {
    const entries: StatementTransaction[] = [
      txn({
        id: 'b',
        rowType: 'beginning_balance',
        amount: 15062.62,
        description: 'Beginning Balance $15,062.62',
        isPostingCandidate: false,
        section: 'account_summary'
      }),
      txn({
        id: 'e',
        rowType: 'ending_balance',
        amount: 19830.01,
        description: 'Ending Balance $19,830.01',
        isPostingCandidate: false,
        section: 'account_summary'
      }),
      txn({
        id: 'd1',
        section: 'deposits',
        rowType: 'deposit',
        amount: 2480,
        description: 'DEPOSIT'
      }),
      txn({
        id: 'f1',
        rowType: 'summary_total',
        section: 'deposits',
        amount: 36600,
        description: '9 item(s) totaling $36,600.00',
        isPostingCandidate: false
      })
    ];

    const overview = buildStatementOverview({
      statement: baseStatement,
      entries,
      liveMetrics: {
        entryCount: 1,
        debitCount: 0,
        creditCount: 1,
        startingBalance: 15062.62,
        endingBalance: 19830.01
      },
    });

    expect(overview.sections).toHaveLength(1);
    expect(overview.sections[0].label).toBe('Deposits');
    expect(overview.sections[0].count.value).toBe(9);
    expect(overview.sections[0].total.value).toBe(36600);
    expect(overview.summary.beginningBalance.display).toContain('15,062.62');
    expect(overview.checksMeta.ready).toBe(true);
    expect(overview.checks.length).toBeGreaterThan(0);
  });
});
