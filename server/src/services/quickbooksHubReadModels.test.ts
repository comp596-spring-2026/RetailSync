import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartFindChain = {
  sort: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn()
};

const entityFindChain = {
  sort: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn()
};

const ledgerFindChain = {
  sort: vi.fn(),
  skip: vi.fn(),
  limit: vi.fn()
};

const {
  chartFindMock,
  chartCountDocumentsMock,
  entityAggregateMock,
  entityFindMock,
  entityCountDocumentsMock,
  ledgerFindMock,
  ledgerCountDocumentsMock,
  ensureFreshQuickBooksSecretMock,
  requestQuickBooksApiMock,
  listQuickBooksAccountsMock,
  runQuickBooksReadQueryMock,
  createQuickBooksCheckTransactionMock,
  createQuickBooksJournalEntryMock
} = vi.hoisted(() => ({
  chartFindMock: vi.fn(),
  chartCountDocumentsMock: vi.fn(),
  entityAggregateMock: vi.fn(),
  entityFindMock: vi.fn(),
  entityCountDocumentsMock: vi.fn(),
  ledgerFindMock: vi.fn(),
  ledgerCountDocumentsMock: vi.fn(),
  ensureFreshQuickBooksSecretMock: vi.fn(),
  requestQuickBooksApiMock: vi.fn(),
  listQuickBooksAccountsMock: vi.fn(),
  runQuickBooksReadQueryMock: vi.fn(),
  createQuickBooksCheckTransactionMock: vi.fn(),
  createQuickBooksJournalEntryMock: vi.fn()
}));

chartFindChain.sort.mockReturnValue(chartFindChain);
chartFindChain.skip.mockReturnValue(chartFindChain);
entityFindChain.sort.mockReturnValue(entityFindChain);
entityFindChain.skip.mockReturnValue(entityFindChain);
ledgerFindChain.sort.mockReturnValue(ledgerFindChain);
ledgerFindChain.skip.mockReturnValue(ledgerFindChain);

vi.mock('../models/ChartOfAccount', () => ({
  ChartOfAccountModel: {
    find: chartFindMock,
    countDocuments: chartCountDocumentsMock
  }
}));

vi.mock('../models/QuickBooksReference', () => ({
  QuickBooksReferenceModel: {
    aggregate: entityAggregateMock,
    find: entityFindMock,
    countDocuments: entityCountDocumentsMock
  }
}));

vi.mock('../models/LedgerEntry', () => ({
  LedgerEntryModel: {
    find: ledgerFindMock,
    countDocuments: ledgerCountDocumentsMock
  }
}));

vi.mock('../integrations/quickbooks', () => ({
  ensureFreshQuickBooksSecret: ensureFreshQuickBooksSecretMock,
  requestQuickBooksApi: requestQuickBooksApiMock,
  listQuickBooksAccounts: listQuickBooksAccountsMock,
  runQuickBooksReadQuery: runQuickBooksReadQueryMock,
  createQuickBooksCheckTransaction: createQuickBooksCheckTransactionMock,
  createQuickBooksJournalEntry: createQuickBooksJournalEntryMock
}));

describe('quickbooks hub read models', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chartFindChain.sort.mockReturnValue(chartFindChain);
    chartFindChain.skip.mockReturnValue(chartFindChain);
    entityFindChain.sort.mockReturnValue(entityFindChain);
    entityFindChain.skip.mockReturnValue(entityFindChain);
    ledgerFindChain.sort.mockReturnValue(ledgerFindChain);
    ledgerFindChain.skip.mockReturnValue(ledgerFindChain);
  });

  it('maps chart of accounts into paginated hub rows', async () => {
    chartFindMock.mockReturnValue(chartFindChain);
    chartFindChain.limit.mockResolvedValue([
      {
        _id: 'coa-1',
        qbAccountId: 'qb-100',
        name: 'Checking',
        type: 'asset',
        isSystem: false
      }
    ]);
    chartCountDocumentsMock.mockResolvedValue(1);

    const { listQuickBooksHubChartOfAccounts } = await import('./quickbooksTaxService');
    const result = await listQuickBooksHubChartOfAccounts({
      companyId: 'company-1',
      page: 1,
      pageSize: 25,
      sort: 'name',
      search: 'check'
    });

    expect(chartFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        $or: expect.any(Array)
      })
    );
    expect(result).toEqual({
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: 'coa-1',
          qbId: 'qb-100',
          name: 'Checking',
          type: 'asset',
          detailType: null,
          status: 'active',
          balance: null
        }
      ]
    });
  });

  it('maps vendor entities with raw contact fields and balance sort support', async () => {
    entityAggregateMock.mockResolvedValue([
      {
        _id: 'ref-1',
        qbId: 'vendor-1',
        entityType: 'vendor',
        displayName: 'Acme Supplies',
        active: true,
        raw: {
          PrimaryEmailAddr: { Address: 'ap@acme.test' },
          PrimaryPhone: { FreeFormNumber: '555-0100' },
          Balance: '42.75'
        }
      }
    ]);
    entityCountDocumentsMock.mockResolvedValue(1);

    const { listQuickBooksHubEntities } = await import('./quickbooksTaxService');
    const result = await listQuickBooksHubEntities({
      companyId: 'company-1',
      entityType: 'vendor',
      page: 1,
      pageSize: 10,
      sort: '-balance'
    });

    expect(entityAggregateMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ $match: expect.objectContaining({ entityType: 'vendor' }) })
      ])
    );
    expect(result.items).toEqual([
      {
        id: 'ref-1',
        qbId: 'vendor-1',
        entityType: 'vendor',
        displayName: 'Acme Supplies',
        email: 'ap@acme.test',
        phone: '555-0100',
        status: 'active',
        balance: 42.75
      }
    ]);
  });

  it('maps operations from ledger entries into queue-friendly rows', async () => {
    ledgerFindMock.mockReturnValue(ledgerFindChain);
    ledgerFindChain.limit.mockResolvedValue([
      {
        _id: 'entry-1',
        date: '2026-03-01',
        type: 'debit',
        description: 'Office supplies',
        merchant: 'Staples',
        amount: 19.95,
        proposal: { qbTxnType: 'Expense', payeeName: 'Staples' },
        posting: { status: 'failed', qbTxnId: 'txn-9', error: 'validation failed' }
      }
    ]);
    ledgerCountDocumentsMock.mockResolvedValue(1);

    const { listQuickBooksHubOperations } = await import('./quickbooksTaxService');
    const result = await listQuickBooksHubOperations({
      companyId: 'company-1',
      page: 1,
      pageSize: 25,
      sort: '-date',
      status: 'failed',
      type: 'Expense'
    });

    expect(ledgerFindMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        'posting.status': 'failed',
        'proposal.qbTxnType': 'Expense'
      })
    );
    expect(result.items).toEqual([
      {
        id: 'entry-1',
        date: '2026-03-01',
        type: 'Expense',
        description: 'Office supplies',
        payee: 'Staples',
        amount: 19.95,
        status: 'failed',
        qbId: 'txn-9',
        error: 'validation failed'
      }
    ]);
  });
});
