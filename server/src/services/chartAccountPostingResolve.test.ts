import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  mergeStatementProposal,
  resolveChartAccountQbId,
  resolveDefaultDepositLineQbId
} from './chartAccountPostingResolve';

vi.mock('../integrations/quickbooks/client', () => ({
  findDefaultQuickBooksIncomeAccount: vi.fn()
}));

const { findDefaultQuickBooksIncomeAccount } = await import('../integrations/quickbooks/client');

vi.mock('../models/ChartOfAccount', () => ({
  ChartOfAccountModel: {
    findOne: vi.fn()
  }
}));

const { ChartOfAccountModel } = await import('../models/ChartOfAccount');

describe('resolveChartAccountQbId', () => {
  beforeEach(() => {
    vi.mocked(ChartOfAccountModel.findOne).mockReset();
  });

  it('returns qb id from chart account document', async () => {
    vi.mocked(ChartOfAccountModel.findOne).mockReturnValue({
      select: () => ({
        lean: async () => ({ qbAccountId: '99' })
      })
    } as never);

    await expect(resolveChartAccountQbId('company-1', 'Office Supplies')).resolves.toBe('99');
  });

  it('returns numeric ref when no cached chart row exists', async () => {
    vi.mocked(ChartOfAccountModel.findOne).mockReturnValue({
      select: () => ({
        lean: async () => null
      })
    } as never);

    await expect(resolveChartAccountQbId('company-1', '35')).resolves.toBe('35');
  });

  it('returns undefined for unresolved display names', async () => {
    vi.mocked(ChartOfAccountModel.findOne).mockReturnValue({
      select: () => ({
        lean: async () => null
      })
    } as never);

    await expect(resolveChartAccountQbId('company-1', 'Office Supplies')).resolves.toBeUndefined();
  });
});

describe('resolveDefaultDepositLineQbId', () => {
  beforeEach(() => {
    vi.mocked(findDefaultQuickBooksIncomeAccount).mockReset();
  });

  it('prefers cached revenue chart account', async () => {
    vi.mocked(ChartOfAccountModel.findOne).mockReturnValue({
      sort: () => ({
        select: () => ({
          lean: async () => ({ qbAccountId: 'income-99' })
        })
      })
    } as never);

    await expect(resolveDefaultDepositLineQbId('company-1')).resolves.toBe('income-99');
    expect(findDefaultQuickBooksIncomeAccount).not.toHaveBeenCalled();
  });
});

describe('mergeStatementProposal', () => {
  it('does not clear existing fields when patch values are undefined', () => {
    expect(
      mergeStatementProposal(
        { qbTxnType: 'Expense', bankAccountId: '35', categoryAccountId: '7000' },
        { bankAccountId: undefined, categoryAccountId: '8000' }
      )
    ).toEqual({
      qbTxnType: 'Expense',
      bankAccountId: '35',
      categoryAccountId: '8000'
    });
  });
});
