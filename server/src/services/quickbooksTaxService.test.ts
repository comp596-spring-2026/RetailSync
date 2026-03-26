import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureFreshQuickBooksSecretMock,
  requestQuickBooksApiMock,
  listQuickBooksAccountsMock,
  runQuickBooksReadQueryMock,
  createQuickBooksCheckTransactionMock,
  createQuickBooksJournalEntryMock
} = vi.hoisted(() => ({
  ensureFreshQuickBooksSecretMock: vi.fn(),
  requestQuickBooksApiMock: vi.fn(),
  listQuickBooksAccountsMock: vi.fn(),
  runQuickBooksReadQueryMock: vi.fn(),
  createQuickBooksCheckTransactionMock: vi.fn(),
  createQuickBooksJournalEntryMock: vi.fn()
}));

vi.mock('../integrations/quickbooks', () => ({
  ensureFreshQuickBooksSecret: ensureFreshQuickBooksSecretMock,
  requestQuickBooksApi: requestQuickBooksApiMock,
  listQuickBooksAccounts: listQuickBooksAccountsMock,
  runQuickBooksReadQuery: runQuickBooksReadQueryMock,
  createQuickBooksCheckTransaction: createQuickBooksCheckTransactionMock,
  createQuickBooksJournalEntry: createQuickBooksJournalEntryMock
}));

const reportPayload = (rows: Array<{ label: string; amount: string }>) => ({
  Rows: {
    Row: rows.map((row) => ({
      ColData: [{ value: row.label }, { value: row.amount }]
    }))
  }
});

describe('quickbooksTaxService.fetchQuickBooksTaxOverview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshQuickBooksSecretMock.mockResolvedValue({ realmId: 'realm-1' });
  });

  it('returns overview cards when ar/ap aging are denied but core reports succeed', async () => {
    requestQuickBooksApiMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/reports/ProfitAndLoss')) {
        return reportPayload([{ label: 'Net Income', amount: '150.25' }]);
      }
      if (path.endsWith('/reports/BalanceSheet')) {
        return reportPayload([
          { label: 'Total Assets', amount: '1200.00' },
          { label: 'Total Liabilities', amount: '300.00' },
          { label: 'Total Equity', amount: '900.00' }
        ]);
      }
      if (
        path.endsWith('/reports/ARAgingSummary') ||
        path.endsWith('/reports/APAgingSummary')
      ) {
        throw new Error(
          'quickbooks_api_failed:400:Permission Denied Error : To access this, sign in again or contact an administrator.'
        );
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const { fetchQuickBooksTaxOverview } = await import('./quickbooksTaxService');

    await expect(
      fetchQuickBooksTaxOverview({
        companyId: 'company-1',
        from: '2026-01-01',
        to: '2026-03-25',
        basis: 'cash'
      })
    ).resolves.toEqual({
      from: '2026-01-01',
      to: '2026-03-25',
      basis: 'cash',
      cards: {
        netIncome: 150.25,
        totalAssets: 1200,
        totalLiabilities: 300,
        totalEquity: 900,
        arOpen: null,
        apOpen: null
      }
    });
  });

  it('still fails overview when a core report fails', async () => {
    requestQuickBooksApiMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/reports/ProfitAndLoss')) {
        return reportPayload([{ label: 'Net Income', amount: '150.25' }]);
      }
      if (path.endsWith('/reports/BalanceSheet')) {
        throw new Error(
          'quickbooks_api_failed:400:Permission Denied Error : To access this, sign in again or contact an administrator.'
        );
      }
      if (
        path.endsWith('/reports/ARAgingSummary') ||
        path.endsWith('/reports/APAgingSummary')
      ) {
        return reportPayload([{ label: 'Total', amount: '42.00' }]);
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const { fetchQuickBooksTaxOverview } = await import('./quickbooksTaxService');

    await expect(
      fetchQuickBooksTaxOverview({
        companyId: 'company-1',
        from: '2026-01-01',
        to: '2026-03-25',
        basis: 'accrual'
      })
    ).rejects.toThrow(
      'quickbooks_api_failed:400:Permission Denied Error : To access this, sign in again or contact an administrator.'
    );
  });

  it('still fails overview when ar/ap aging fail for non-permission reasons', async () => {
    requestQuickBooksApiMock.mockImplementation(async ({ path }: { path: string }) => {
      if (path.endsWith('/reports/ProfitAndLoss')) {
        return reportPayload([{ label: 'Net Income', amount: '150.25' }]);
      }
      if (path.endsWith('/reports/BalanceSheet')) {
        return reportPayload([
          { label: 'Total Assets', amount: '1200.00' },
          { label: 'Total Liabilities', amount: '300.00' },
          { label: 'Total Equity', amount: '900.00' }
        ]);
      }
      if (path.endsWith('/reports/ARAgingSummary')) {
        throw new Error('quickbooks_api_failed:network:socket hang up');
      }
      if (path.endsWith('/reports/APAgingSummary')) {
        return reportPayload([{ label: 'Total', amount: '42.00' }]);
      }
      throw new Error(`unexpected path: ${path}`);
    });

    const { fetchQuickBooksTaxOverview } = await import('./quickbooksTaxService');

    await expect(
      fetchQuickBooksTaxOverview({
        companyId: 'company-1',
        from: '2026-01-01',
        to: '2026-03-25',
        basis: 'cash'
      })
    ).rejects.toThrow('quickbooks_api_failed:network:socket hang up');
  });
});
