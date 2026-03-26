import type { Request, Response } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv } from './test/testUtils';

const {
  createQuickBooksWriteTransactionMock,
  fetchQuickBooksTaxOverviewMock,
  fetchQuickBooksTaxReportMock,
  getQuickBooksWriteTransactionDetailMock,
  getQuickBooksAccountRegisterMock,
  getQuickBooksTransactionDetailMock,
  listQuickBooksHubChartOfAccountsMock,
  listQuickBooksHubEntitiesMock,
  listQuickBooksHubOperationsMock,
  listQuickBooksLiveTransactionsMock,
  listQuickBooksTaxChartOfAccountsMock,
  listQuickBooksTaxLedgerMock,
  listQuickBooksTaxPaymentsMock,
  listQuickBooksWriteTransactionsMock,
  recoverQuickBooksPaymentMock,
  createQuickBooksJournalAdjustmentMock,
  updateQuickBooksWriteTransactionMock
} = vi.hoisted(() => ({
  createQuickBooksWriteTransactionMock: vi.fn(),
  fetchQuickBooksTaxOverviewMock: vi.fn(),
  fetchQuickBooksTaxReportMock: vi.fn(),
  getQuickBooksWriteTransactionDetailMock: vi.fn(),
  getQuickBooksAccountRegisterMock: vi.fn(),
  getQuickBooksTransactionDetailMock: vi.fn(),
  listQuickBooksHubChartOfAccountsMock: vi.fn(),
  listQuickBooksHubEntitiesMock: vi.fn(),
  listQuickBooksHubOperationsMock: vi.fn(),
  listQuickBooksLiveTransactionsMock: vi.fn(),
  listQuickBooksTaxChartOfAccountsMock: vi.fn(),
  listQuickBooksTaxLedgerMock: vi.fn(),
  listQuickBooksTaxPaymentsMock: vi.fn(),
  listQuickBooksWriteTransactionsMock: vi.fn(),
  recoverQuickBooksPaymentMock: vi.fn(),
  createQuickBooksJournalAdjustmentMock: vi.fn(),
  updateQuickBooksWriteTransactionMock: vi.fn()
}));

vi.mock('./services/quickbooksTaxService', () => ({
  fetchQuickBooksTaxOverview: fetchQuickBooksTaxOverviewMock,
  fetchQuickBooksTaxReport: fetchQuickBooksTaxReportMock,
  getQuickBooksAccountRegister: getQuickBooksAccountRegisterMock,
  getQuickBooksTransactionDetail: getQuickBooksTransactionDetailMock,
  listQuickBooksHubChartOfAccounts: listQuickBooksHubChartOfAccountsMock,
  listQuickBooksHubEntities: listQuickBooksHubEntitiesMock,
  listQuickBooksHubOperations: listQuickBooksHubOperationsMock,
  listQuickBooksLiveTransactions: listQuickBooksLiveTransactionsMock,
  listQuickBooksTaxChartOfAccounts: listQuickBooksTaxChartOfAccountsMock,
  listQuickBooksTaxLedger: listQuickBooksTaxLedgerMock,
  listQuickBooksTaxPayments: listQuickBooksTaxPaymentsMock,
  recoverQuickBooksPayment: recoverQuickBooksPaymentMock,
  createQuickBooksJournalAdjustment: createQuickBooksJournalAdjustmentMock
}));

vi.mock('./services/quickbooksWriteService', () => ({
  createQuickBooksWriteTransaction: createQuickBooksWriteTransactionMock,
  getQuickBooksWriteTransactionDetail: getQuickBooksWriteTransactionDetailMock,
  listQuickBooksWriteTransactions: listQuickBooksWriteTransactionsMock,
  updateQuickBooksWriteTransaction: updateQuickBooksWriteTransactionMock
}));

type TestResponse = {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

const createResponse = (): TestResponse => {
  const status = vi.fn();
  const json = vi.fn();

  const res = {
    status: (code: number) => {
      status(code);
      return res;
    },
    json: (payload: unknown) => {
      json(payload);
      return res;
    }
  } as unknown as Response;

  return { res, status, json };
};

describe('quickbooksTaxController', () => {
  type ControllerFn = (req: Request, res: Response) => Promise<Response | undefined>;
  const currentIsoDate = () => new Date().toISOString().slice(0, 10);

  let getQuickBooksTaxOverview: ControllerFn;
  let getQuickBooksTaxReport: ControllerFn;
  let getQuickBooksAccountRegisterByAccount: ControllerFn;
  let getQuickBooksHubChartOfAccounts: ControllerFn;
  let getQuickBooksHubEntities: ControllerFn;
  let getQuickBooksHubOperations: ControllerFn;
  let getQuickBooksLiveTransactionsByType: ControllerFn;
  let getQuickBooksTransactionDetailById: ControllerFn;
  let getQuickBooksWriteTransactionsByType: ControllerFn;
  let getQuickBooksWriteTransactionDetailById: ControllerFn;
  let getQuickBooksTaxPayments: ControllerFn;
  let patchQuickBooksWriteTransaction: ControllerFn;
  let postQuickBooksRecoverPayment: ControllerFn;
  let postQuickBooksWriteTransaction: ControllerFn;

  beforeAll(async () => {
    setupTestEnv();
    const controller = await import('./controllers/quickbooksTaxController');
    getQuickBooksTaxOverview = controller.getQuickBooksTaxOverview;
    getQuickBooksTaxReport = controller.getQuickBooksTaxReport;
    getQuickBooksAccountRegisterByAccount = controller.getQuickBooksAccountRegisterByAccount;
    getQuickBooksHubChartOfAccounts = controller.getQuickBooksHubChartOfAccounts;
    getQuickBooksHubEntities = controller.getQuickBooksHubEntities;
    getQuickBooksHubOperations = controller.getQuickBooksHubOperations;
    getQuickBooksLiveTransactionsByType = controller.getQuickBooksLiveTransactionsByType;
    getQuickBooksTransactionDetailById = controller.getQuickBooksTransactionDetailById;
    getQuickBooksWriteTransactionsByType = controller.getQuickBooksWriteTransactionsByType;
    getQuickBooksWriteTransactionDetailById = controller.getQuickBooksWriteTransactionDetailById;
    getQuickBooksTaxPayments = controller.getQuickBooksTaxPayments;
    patchQuickBooksWriteTransaction = controller.patchQuickBooksWriteTransaction;
    postQuickBooksRecoverPayment = controller.postQuickBooksRecoverPayment;
    postQuickBooksWriteTransaction = controller.postQuickBooksWriteTransaction;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when company context is missing', async () => {
    const { res, status, json } = createResponse();
    const req = {} as Request;

    await getQuickBooksTaxOverview(req, res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: 'Company onboarding required'
      })
    );
  });

  it('returns 422 for unsupported report key', async () => {
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: {
        reportKey: 'invalid-report'
      }
    } as unknown as Request;

    await getQuickBooksTaxReport(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(fetchQuickBooksTaxReportMock).not.toHaveBeenCalled();
  });

  it('parses account register query and calls service', async () => {
    getQuickBooksAccountRegisterMock.mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      accountId: '35',
      from: '2026-01-01',
      to: '2026-03-25',
      basis: 'cash',
      items: []
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { accountId: '35' },
      query: {
        basis: 'cash',
        search: 'rent'
      }
    } as unknown as Request;

    await getQuickBooksAccountRegisterByAccount(req, res);

    expect(getQuickBooksAccountRegisterMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      accountId: '35',
      from: '2026-01-01',
      to: currentIsoDate(),
      basis: 'cash',
      page: 1,
      pageSize: 25,
      search: 'rent',
      sort: '-date'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('uses defaults and calls hub chart-of-accounts service', async () => {
    listQuickBooksHubChartOfAccountsMock.mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      items: []
    });
    const { res, status, json } = createResponse();
    const req = {
      companyId: 'company-1',
      query: {}
    } as unknown as Request;

    await getQuickBooksHubChartOfAccounts(req, res);

    expect(listQuickBooksHubChartOfAccountsMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      page: 1,
      pageSize: 25,
      sort: 'name'
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
  });

  it('returns 422 for invalid hub entity type', async () => {
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      query: {
        entityType: 'employee'
      }
    } as unknown as Request;

    await getQuickBooksHubEntities(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(listQuickBooksHubEntitiesMock).not.toHaveBeenCalled();
  });

  it('parses hub entity filters and calls service', async () => {
    listQuickBooksHubEntitiesMock.mockResolvedValue({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      items: []
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      query: {
        entityType: 'vendor',
        page: '2',
        pageSize: '10',
        search: 'acme',
        sort: '-balance',
        status: 'active'
      }
    } as unknown as Request;

    await getQuickBooksHubEntities(req, res);

    expect(listQuickBooksHubEntitiesMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      entityType: 'vendor',
      page: 2,
      pageSize: 10,
      search: 'acme',
      sort: '-balance',
      status: 'active'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('parses live transaction list filters and calls service', async () => {
    listQuickBooksLiveTransactionsMock.mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      type: 'check',
      items: []
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { type: 'check' },
      query: {
        page: '2',
        pageSize: '20',
        startDate: '2026-01-01',
        endDate: '2026-03-25',
        sort: 'amount'
      }
    } as unknown as Request;

    await getQuickBooksLiveTransactionsByType(req, res);

    expect(listQuickBooksLiveTransactionsMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      type: 'check',
      page: 2,
      pageSize: 20,
      startDate: '2026-01-01',
      endDate: '2026-03-25',
      sort: 'amount'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('requires transaction detail type query and calls service', async () => {
    getQuickBooksTransactionDetailMock.mockResolvedValue({
      id: 'txn-1',
      qbTxnId: 'txn-1',
      type: 'expense',
      txnDate: '2026-03-10',
      docNum: null,
      payeeName: 'Staples',
      memo: null,
      amount: 18.5,
      accountId: '35',
      accountName: 'Checking',
      categoryAccountId: '7000',
      categoryAccountName: 'Supplies',
      fromAccountId: null,
      fromAccountName: null,
      toAccountId: null,
      toAccountName: null,
      raw: {}
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { qbTxnId: 'txn-1' },
      query: { type: 'expense' }
    } as unknown as Request;

    await getQuickBooksTransactionDetailById(req, res);

    expect(getQuickBooksTransactionDetailMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      qbTxnId: 'txn-1',
      type: 'expense'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('parses hub operations filters and calls service', async () => {
    listQuickBooksHubOperationsMock.mockResolvedValue({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 0,
      items: []
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      query: {
        search: 'check',
        status: 'failed',
        type: 'Expense',
        sort: '-amount',
        startDate: '2026-01-01',
        endDate: '2026-03-25'
      }
    } as unknown as Request;

    await getQuickBooksHubOperations(req, res);

    expect(listQuickBooksHubOperationsMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      page: 1,
      pageSize: 25,
      search: 'check',
      status: 'failed',
      type: 'Expense',
      sort: '-amount',
      startDate: '2026-01-01',
      endDate: '2026-03-25'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('parses quickbooks write list filters and calls service', async () => {
    listQuickBooksWriteTransactionsMock.mockResolvedValue({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      txnType: 'invoice',
      items: []
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { txnType: 'invoice' },
      query: {
        page: '2',
        pageSize: '10',
        search: 'acme',
        sort: '-totalAmount',
        customerId: 'customer-1',
        startDate: '2026-03-01',
        endDate: '2026-03-25'
      }
    } as unknown as Request;

    await getQuickBooksWriteTransactionsByType(req, res);

    expect(listQuickBooksWriteTransactionsMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      txnType: 'invoice',
      page: 2,
      pageSize: 10,
      search: 'acme',
      sort: '-totalAmount',
      customerId: 'customer-1',
      startDate: '2026-03-01',
      endDate: '2026-03-25'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('returns quickbooks write detail payload on success', async () => {
    getQuickBooksWriteTransactionDetailMock.mockResolvedValue({
      id: 'txn-100',
      qbTxnId: 'txn-100',
      txnType: 'sales-receipt',
      txnDate: '2026-03-10',
      docNumber: 'SR-100',
      customerId: 'customer-1',
      customerName: 'Acme',
      totalAmount: 120,
      balanceAmount: 0,
      currencyCode: 'USD',
      status: 'closed',
      emailStatus: 'NeedToSend',
      memo: 'counter sale',
      syncToken: '0',
      dueDate: null,
      customerMemo: null,
      customerEmail: 'billing@acme.test',
      depositAccountId: '35',
      depositAccountName: 'Checking',
      arAccountId: null,
      arAccountName: null,
      paymentMethodId: 'pm-1',
      paymentMethodName: 'Card',
      lines: [],
      linkedTransactions: [],
      raw: {}
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { txnType: 'sales-receipt', qbTxnId: 'txn-100' }
    } as unknown as Request;

    await getQuickBooksWriteTransactionDetailById(req, res);

    expect(getQuickBooksWriteTransactionDetailMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      txnType: 'sales-receipt',
      qbTxnId: 'txn-100'
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('returns 422 when write path type does not match create payload type', async () => {
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { txnType: 'invoice' },
      body: {
        txnType: 'payment',
        customerId: 'customer-1',
        txnDate: '2026-03-10',
        totalAmount: 45
      }
    } as unknown as Request;

    await postQuickBooksWriteTransaction(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(createQuickBooksWriteTransactionMock).not.toHaveBeenCalled();
  });

  it('creates a quickbooks write transaction and returns 201', async () => {
    createQuickBooksWriteTransactionMock.mockResolvedValue({
      id: 'txn-200',
      qbTxnId: 'txn-200',
      txnType: 'invoice',
      txnDate: '2026-03-15',
      docNumber: 'INV-200',
      customerId: 'customer-2',
      customerName: 'RetailSync Demo',
      totalAmount: 250,
      balanceAmount: 250,
      currencyCode: 'USD',
      status: 'open',
      emailStatus: 'NotSet',
      memo: 'March invoice',
      syncToken: '0',
      dueDate: '2026-03-31',
      customerMemo: null,
      customerEmail: 'ap@example.com',
      depositAccountId: null,
      depositAccountName: null,
      arAccountId: 'ar-1',
      arAccountName: 'Accounts Receivable',
      paymentMethodId: null,
      paymentMethodName: null,
      lines: [],
      linkedTransactions: [],
      raw: {}
    });
    const { res, status, json } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { txnType: 'invoice' },
      body: {
        txnType: 'invoice',
        customerId: 'customer-2',
        txnDate: '2026-03-15',
        dueDate: '2026-03-31',
        lines: [
          {
            amount: 250,
            itemId: 'item-1'
          }
        ]
      }
    } as unknown as Request;

    await postQuickBooksWriteTransaction(req, res);

    expect(createQuickBooksWriteTransactionMock).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        txnType: 'invoice',
        customerId: 'customer-2'
      })
    );
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          qbTxnId: 'txn-200'
        })
      })
    );
  });

  it('patches a quickbooks write transaction and returns the service payload', async () => {
    updateQuickBooksWriteTransactionMock.mockResolvedValue({
      id: 'txn-300',
      qbTxnId: 'txn-300',
      txnType: 'payment',
      txnDate: '2026-03-20',
      docNumber: 'PAY-300',
      customerId: 'customer-3',
      customerName: 'Customer 3',
      totalAmount: 80,
      balanceAmount: 0,
      currencyCode: 'USD',
      status: 'applied',
      emailStatus: null,
      memo: 'updated payment',
      syncToken: '2',
      dueDate: null,
      customerMemo: null,
      customerEmail: null,
      depositAccountId: '35',
      depositAccountName: 'Checking',
      arAccountId: null,
      arAccountName: null,
      paymentMethodId: 'pm-1',
      paymentMethodName: 'ACH',
      lines: [],
      linkedTransactions: [
        {
          txnId: 'invoice-8',
          txnType: 'Invoice',
          amount: 80
        }
      ],
      raw: {}
    });
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      params: { txnType: 'payment', qbTxnId: 'txn-300' },
      body: {
        txnType: 'payment',
        syncToken: '1',
        totalAmount: 80,
        linkedTransactions: [
          {
            txnId: 'invoice-8',
            txnType: 'Invoice',
            amount: 80
          }
        ]
      }
    } as unknown as Request;

    await patchQuickBooksWriteTransaction(req, res);

    expect(updateQuickBooksWriteTransactionMock).toHaveBeenCalledWith({
      companyId: 'company-1',
      txnType: 'payment',
      qbTxnId: 'txn-300',
      input: expect.objectContaining({
        syncToken: '1',
        txnType: 'payment'
      })
    });
    expect(status).toHaveBeenCalledWith(200);
  });

  it('uses defaults and calls tax payments service', async () => {
    listQuickBooksTaxPaymentsMock.mockResolvedValue({
      from: '2026-01-01',
      to: '2026-03-10',
      type: 'all',
      nextCursor: null,
      payments: []
    });
    const { res, status, json } = createResponse();
    const req = {
      companyId: 'company-1',
      query: {}
    } as unknown as Request;

    await getQuickBooksTaxPayments(req, res);

    expect(listQuickBooksTaxPaymentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        type: 'all',
        limit: 100
      })
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok'
      })
    );
  });

  it('validates recover-payment payload and returns 422 for missing customerId', async () => {
    const { res, status } = createResponse();
    const req = {
      companyId: 'company-1',
      body: {
        clientRequestId: 'req-123456',
        paymentType: 'customer',
        txnDate: '2026-03-10',
        amount: 10,
        bankAccountId: '35'
      }
    } as unknown as Request;

    await postQuickBooksRecoverPayment(req, res);

    expect(status).toHaveBeenCalledWith(422);
    expect(recoverQuickBooksPaymentMock).not.toHaveBeenCalled();
  });

  it('returns recover-payment service payload on success', async () => {
    recoverQuickBooksPaymentMock.mockResolvedValue({
      created: true,
      clientRequestId: 'req-222222',
      paymentId: '11',
      txnType: 'Payment',
      txnDate: '2026-03-10',
      amount: 88.5
    });
    const { res, status, json } = createResponse();
    const req = {
      companyId: 'company-1',
      body: {
        clientRequestId: 'req-222222',
        paymentType: 'customer',
        txnDate: '2026-03-10',
        amount: 88.5,
        bankAccountId: '35',
        customerId: '12'
      }
    } as unknown as Request;

    await postQuickBooksRecoverPayment(req, res);

    expect(recoverQuickBooksPaymentMock).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        clientRequestId: 'req-222222'
      })
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          paymentId: '11'
        })
      })
    );
  });
});
