import { describe, expect, it } from 'vitest';
import { buildStatementValidationReport } from './statementValidationService';

type BuildRowsArgs = {
  rowType: 'deposit' | 'electronic_credit' | 'other_credit' | 'electronic_debit' | 'check_cleared' | 'daily_balance';
  section:
    | 'deposits'
    | 'electronic_credits'
    | 'other_credits'
    | 'electronic_debits'
    | 'checks_cleared'
    | 'daily_balances';
  direction: 'credit' | 'debit';
  count: number;
  amount: number;
  startPage?: number;
};

const buildRows = (args: BuildRowsArgs) =>
  Array.from({ length: args.count }, (_, index) => ({
    localId: `${args.rowType}-${index + 1}`,
    postDate: '2025-12-01',
    amount: args.amount,
    type: args.direction,
    rowType: args.rowType,
    section: args.section,
    description: `${args.rowType} row ${index + 1}`,
    isPostingCandidate: args.rowType !== 'daily_balance',
    sourceLocator: { pageNumber: (args.startPage ?? 1) + (index % 2), sourceText: `${args.rowType} raw` }
  }));

describe('statementValidationService', () => {
  it('passes for the SouthState truth fixture profile', () => {
    const rows = [
      {
        localId: 'begin',
        postDate: '2025-11-29',
        amount: 15062.62,
        type: 'credit' as const,
        rowType: 'beginning_balance' as const,
        section: 'account_summary' as const,
        description: 'Beginning Balance 11/29/2025 15,062.62',
        isPostingCandidate: false,
        sourceLocator: { pageNumber: 1, sourceText: 'Beginning Balance' }
      },
      ...buildRows({ rowType: 'deposit', section: 'deposits', direction: 'credit', count: 9, amount: 4066.6666667 }),
      ...buildRows({ rowType: 'electronic_credit', section: 'electronic_credits', direction: 'credit', count: 5, amount: 1061.078 }),
      ...buildRows({ rowType: 'other_credit', section: 'other_credits', direction: 'credit', count: 19, amount: 2375.9973684 }),
      ...buildRows({ rowType: 'electronic_debit', section: 'electronic_debits', direction: 'debit', count: 38, amount: 1303.6302632 }),
      ...buildRows({ rowType: 'check_cleared', section: 'checks_cleared', direction: 'debit', count: 44, amount: 744.1818182 }),
      ...buildRows({ rowType: 'daily_balance', section: 'daily_balances', direction: 'debit', count: 22, amount: 0, startPage: 3 }),
      {
        localId: 'ending',
        postDate: '2025-12-31',
        amount: 19830.01,
        type: 'credit' as const,
        rowType: 'ending_balance' as const,
        section: 'account_summary' as const,
        description: 'Ending Balance 12/31/2025 19,830.01',
        isPostingCandidate: false,
        sourceLocator: { pageNumber: 1, sourceText: 'Ending Balance' }
      }
    ];

    // adjust rounding to exact known totals
    rows[1].amount = 3600;
    rows[2].amount = 4000;
    rows[3].amount = 3800;
    rows[4].amount = 3900;
    rows[5].amount = 4100;
    rows[6].amount = 4200;
    rows[7].amount = 4300;
    rows[8].amount = 4400;
    rows[9].amount = 4300;
    // credits 5 -> 5305.39
    rows[10].amount = 1000;
    rows[11].amount = 1000;
    rows[12].amount = 1000;
    rows[13].amount = 1000;
    rows[14].amount = 1305.39;

    const report = buildStatementValidationReport({
      statementId: 'statement-1',
      rows: rows as any
    });

    expect(report.passed).toBe(true);
    expect(report.mismatches).toHaveLength(0);
    expect(report.actual.dailyBalancesCount).toBe(22);
  });

  it('fails loudly when totals drift', () => {
    const rows = [
      {
        localId: 'begin',
        postDate: '2025-11-29',
        amount: 15062.62,
        type: 'credit' as const,
        rowType: 'beginning_balance' as const,
        section: 'account_summary' as const,
        description: 'Beginning Balance',
        isPostingCandidate: false,
        sourceLocator: { pageNumber: 1, sourceText: 'Beginning Balance' }
      },
      ...buildRows({ rowType: 'deposit', section: 'deposits', direction: 'credit', count: 8, amount: 1000 }),
      {
        localId: 'ending',
        postDate: '2025-12-31',
        amount: 19830.01,
        type: 'credit' as const,
        rowType: 'ending_balance' as const,
        section: 'account_summary' as const,
        description: 'Ending Balance',
        isPostingCandidate: false,
        sourceLocator: { pageNumber: 1, sourceText: 'Ending Balance' }
      }
    ];

    const report = buildStatementValidationReport({
      statementId: 'statement-2',
      rows: rows as any
    });

    expect(report.passed).toBe(false);
    expect(report.mismatches.some((mismatch) => mismatch.code === 'deposits_count_mismatch')).toBe(true);
  });
});
