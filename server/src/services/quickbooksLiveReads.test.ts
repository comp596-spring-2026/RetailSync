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

describe('quickbooks live reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshQuickBooksSecretMock.mockResolvedValue({ realmId: 'realm-1' });
  });

  it('maps account register rows from the general ledger report', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      Rows: {
        Row: [
          {
            ColData: [
              { value: '2026-03-01' },
              { value: 'Check' },
              { value: '1002' },
              { value: 'Acme Supplies' },
              { value: 'Paper order' },
              { value: 'Office Expense' },
              { value: '45.10' },
              { value: '' },
              { value: '955.90' }
            ]
          }
        ]
      }
    });

    const { getQuickBooksAccountRegister } = await import('./quickbooksTaxService');
    const result = await getQuickBooksAccountRegister({
      companyId: 'company-1',
      accountId: '35',
      from: '2026-01-01',
      to: '2026-03-25',
      basis: 'cash',
      page: 1,
      pageSize: 25,
      sort: '-date'
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v3/company/realm-1/reports/GeneralLedger',
        query: expect.objectContaining({
          account: '35'
        })
      })
    );
    expect(result.items[0]).toEqual({
      id: '2026-03-01:Check:1002:Paper order:1',
      accountId: '35',
      date: '2026-03-01',
      txnType: 'Check',
      qbTxnId: '2026-03-01:Check:1002:Paper order:1',
      docNum: '1002',
      name: 'Acme Supplies',
      memo: 'Paper order',
      splitAccount: 'Office Expense',
      amount: 45.1,
      debit: 45.1,
      credit: null,
      balance: 955.9
    });
  });

  it('maps live transaction list rows from quickbooks queries', async () => {
    runQuickBooksReadQueryMock
      .mockResolvedValueOnce({
        QueryResponse: {
          Purchase: [
            {
              Id: 'txn-11',
              TxnDate: '2026-03-05',
              PaymentType: 'Check',
              DocNumber: '1005',
              PrivateNote: 'Rent',
              TotalAmt: '1200.00',
              EntityRef: { name: 'Landlord', value: 'v-1' },
              AccountRef: { name: 'Checking', value: '35' }
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        QueryResponse: {
          totalCount: 1
        }
      });

    const { listQuickBooksLiveTransactions } = await import('./quickbooksTaxService');
    const result = await listQuickBooksLiveTransactions({
      companyId: 'company-1',
      type: 'check',
      page: 1,
      pageSize: 25,
      sort: '-date'
    });

    expect(result).toEqual({
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      type: 'check',
      items: [
        {
          id: 'txn-11',
          qbTxnId: 'txn-11',
          type: 'check',
          txnDate: '2026-03-05',
          docNum: '1005',
          payeeName: 'Landlord',
          accountName: 'Checking',
          amount: 1200,
          memo: 'Rent',
          status: 'posted'
        }
      ]
    });
  });

  it('maps transaction detail from the quickbooks entity endpoint', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      Purchase: {
        Id: 'txn-99',
        TxnDate: '2026-03-10',
        DocNumber: '1009',
        PrivateNote: 'Supplies',
        TotalAmt: '18.50',
        AccountRef: { value: '35', name: 'Checking' },
        EntityRef: { value: 'v-9', name: 'Staples' },
        Line: [
          {
            Amount: '18.50',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: '7000', name: 'Office Supplies' }
            }
          }
        ]
      }
    });

    const { getQuickBooksTransactionDetail } = await import('./quickbooksTaxService');
    const result = await getQuickBooksTransactionDetail({
      companyId: 'company-1',
      qbTxnId: 'txn-99',
      type: 'expense'
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v3/company/realm-1/purchase/txn-99'
      })
    );
    expect(result).toEqual({
      id: 'txn-99',
      qbTxnId: 'txn-99',
      type: 'expense',
      txnDate: '2026-03-10',
      docNum: '1009',
      payeeName: 'Staples',
      memo: 'Supplies',
      amount: 18.5,
      accountId: '35',
      accountName: 'Checking',
      categoryAccountId: '7000',
      categoryAccountName: 'Office Supplies',
      fromAccountId: null,
      fromAccountName: null,
      toAccountId: null,
      toAccountName: null,
      raw: {
        Id: 'txn-99',
        TxnDate: '2026-03-10',
        DocNumber: '1009',
        PrivateNote: 'Supplies',
        TotalAmt: '18.50',
        AccountRef: { value: '35', name: 'Checking' },
        EntityRef: { value: 'v-9', name: 'Staples' },
        Line: [
          {
            Amount: '18.50',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: '7000', name: 'Office Supplies' }
            }
          }
        ]
      }
    });
  });
});
