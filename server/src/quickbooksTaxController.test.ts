import type { Request, Response } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv } from './test/testUtils';

const {
  fetchQuickBooksTaxOverviewMock,
  fetchQuickBooksTaxReportMock,
  listQuickBooksTaxChartOfAccountsMock,
  listQuickBooksTaxLedgerMock,
  listQuickBooksTaxPaymentsMock,
  recoverQuickBooksPaymentMock,
  createQuickBooksJournalAdjustmentMock
} = vi.hoisted(() => ({
  fetchQuickBooksTaxOverviewMock: vi.fn(),
  fetchQuickBooksTaxReportMock: vi.fn(),
  listQuickBooksTaxChartOfAccountsMock: vi.fn(),
  listQuickBooksTaxLedgerMock: vi.fn(),
  listQuickBooksTaxPaymentsMock: vi.fn(),
  recoverQuickBooksPaymentMock: vi.fn(),
  createQuickBooksJournalAdjustmentMock: vi.fn()
}));

vi.mock('./services/quickbooksTaxService', () => ({
  fetchQuickBooksTaxOverview: (...args: unknown[]) =>
    fetchQuickBooksTaxOverviewMock(...args),
  fetchQuickBooksTaxReport: (...args: unknown[]) =>
    fetchQuickBooksTaxReportMock(...args),
  listQuickBooksTaxChartOfAccounts: (...args: unknown[]) =>
    listQuickBooksTaxChartOfAccountsMock(...args),
  listQuickBooksTaxLedger: (...args: unknown[]) => listQuickBooksTaxLedgerMock(...args),
  listQuickBooksTaxPayments: (...args: unknown[]) =>
    listQuickBooksTaxPaymentsMock(...args),
  recoverQuickBooksPayment: (...args: unknown[]) => recoverQuickBooksPaymentMock(...args),
  createQuickBooksJournalAdjustment: (...args: unknown[]) =>
    createQuickBooksJournalAdjustmentMock(...args)
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

  let getQuickBooksTaxOverview: ControllerFn;
  let getQuickBooksTaxReport: ControllerFn;
  let getQuickBooksTaxPayments: ControllerFn;
  let postQuickBooksRecoverPayment: ControllerFn;

  beforeAll(async () => {
    setupTestEnv();
    const controller = await import('./controllers/quickbooksTaxController');
    getQuickBooksTaxOverview = controller.getQuickBooksTaxOverview;
    getQuickBooksTaxReport = controller.getQuickBooksTaxReport;
    getQuickBooksTaxPayments = controller.getQuickBooksTaxPayments;
    postQuickBooksRecoverPayment = controller.postQuickBooksRecoverPayment;
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
