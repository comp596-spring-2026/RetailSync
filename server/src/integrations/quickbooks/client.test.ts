import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { ensureFreshQuickBooksSecretMock, refreshQuickBooksSecretForCompanyMock } = vi.hoisted(
  () => ({
    ensureFreshQuickBooksSecretMock: vi.fn(),
    refreshQuickBooksSecretForCompanyMock: vi.fn()
  })
);

vi.mock('./auth', () => ({
  ensureFreshQuickBooksSecret: ensureFreshQuickBooksSecretMock,
  refreshQuickBooksSecretForCompany: refreshQuickBooksSecretForCompanyMock
}));

const makeResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json'
    }
  });

describe('quickbooks client helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshQuickBooksSecretMock.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scope: null,
      idToken: null,
      realmId: 'realm-1',
      environment: 'sandbox',
      companyName: 'RetailSync Demo',
      expiresAt: null,
      refreshExpiresAt: null,
      updatedAt: Date.now()
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a GeneralLedger report request for register reads', async () => {
    fetchMock.mockResolvedValueOnce(makeResponse({ report: 'ok' }));

    const { fetchQuickBooksAccountRegister } = await import('./client');
    const result = await fetchQuickBooksAccountRegister('company-1', {
      accountId: '123',
      from: '2026-01-01',
      to: '2026-01-31',
      page: 2,
      pageSize: 50,
      query: {
        summarize_column_by: 'Days'
      }
    });

    expect(result).toEqual({ report: 'ok' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.pathname).toBe('/v3/company/realm-1/reports/GeneralLedger');
    expect(parsedUrl.searchParams.get('accountId')).toBe('123');
    expect(parsedUrl.searchParams.get('from')).toBe('2026-01-01');
    expect(parsedUrl.searchParams.get('to')).toBe('2026-01-31');
    expect(parsedUrl.searchParams.get('page')).toBe('2');
    expect(parsedUrl.searchParams.get('pageSize')).toBe('50');
    expect(parsedUrl.searchParams.get('summarize_column_by')).toBe('Days');
    expect(parsedUrl.searchParams.get('minorversion')).toBe('75');
  });

  it('fetches transaction details by type and id', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        QueryResponse: {
          JournalEntry: [{ Id: '900', TxnDate: '2026-03-25', PrivateNote: 'phase-2' }]
        }
      })
    );

    const { fetchQuickBooksTransactionDetail } = await import('./client');
    const result = await fetchQuickBooksTransactionDetail('company-1', {
      txnType: 'JournalEntry',
      txnId: '900'
    });

    expect(result).toEqual({
      txnType: 'JournalEntry',
      txnId: '900',
      row: { Id: '900', TxnDate: '2026-03-25', PrivateNote: 'phase-2' },
      payload: {
        QueryResponse: {
          JournalEntry: [{ Id: '900', TxnDate: '2026-03-25', PrivateNote: 'phase-2' }]
        }
      }
    });

    const [url] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(url));
    expect(parsedUrl.pathname).toBe('/v3/company/realm-1/query');
    expect(parsedUrl.searchParams.get('query')).toBe(
      "select * from JournalEntry where Id = '900' startposition 1 maxresults 1"
    );
    expect(parsedUrl.searchParams.get('minorversion')).toBe('75');
  });

  it('retries with the refreshed access token after a 401 and keeps using it on later attempts', async () => {
    refreshQuickBooksSecretForCompanyMock.mockResolvedValue({
      accessToken: 'access-token-refreshed',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scope: null,
      idToken: null,
      realmId: 'realm-1',
      environment: 'sandbox',
      companyName: 'RetailSync Demo',
      expiresAt: null,
      refreshExpiresAt: null,
      updatedAt: Date.now(),
      health: {
        status: 'healthy',
        checkedAt: Date.now(),
        refreshedAt: Date.now(),
        accessTokenExpiresAt: null,
        accessTokenExpiresInSec: null,
        refreshTokenExpiresAt: null,
        refreshTokenExpiresInSec: null,
        lastRefreshError: null,
        lastRefreshErrorAt: null
      }
    });

    fetchMock
      .mockResolvedValueOnce(makeResponse({}, 401))
      .mockResolvedValueOnce(makeResponse({}, 503))
      .mockResolvedValueOnce(makeResponse({ report: 'ok' }));

    const { requestQuickBooksApi } = await import('./client');
    const result = await requestQuickBooksApi({
      companyId: 'company-1',
      method: 'GET',
      path: '/v3/company/realm-1/query'
    });

    expect(result).toEqual({ report: 'ok' });
    expect(refreshQuickBooksSecretForCompanyMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    const thirdInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect((firstInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-token'
    );
    expect((secondInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-token-refreshed'
    );
    expect((thirdInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-token-refreshed'
    );
  });

  it('maps refresh token revocation into a non-retryable auth failure', async () => {
    refreshQuickBooksSecretForCompanyMock.mockRejectedValue(
      new Error('quickbooks_token_refresh_failed:quickbooks_token_exchange_failed:invalid_grant:Token expired')
    );
    fetchMock.mockResolvedValueOnce(makeResponse({}, 401));

    const { requestQuickBooksApi } = await import('./client');
    await expect(
      requestQuickBooksApi({
        companyId: 'company-1',
        method: 'GET',
        path: '/v3/company/realm-1/query'
      })
    ).rejects.toThrow(
      'quickbooks_api_failed:401:quickbooks_token_refresh_failed:quickbooks_token_exchange_failed:invalid_grant:Token expired'
    );

    expect(refreshQuickBooksSecretForCompanyMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'expense',
      fn: 'createQuickBooksExpenseTransaction',
      path: '/v3/company/realm-1/purchase',
      responseKey: 'Purchase',
      expectedBody: {
        TxnDate: '2026-03-25',
        PaymentType: 'Cash',
        AccountRef: { value: '1000' },
        PrivateNote: 'office',
        EntityRef: { value: 'vendor-1' },
        Line: [
          {
            Amount: 19.95,
            Description: 'office',
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: { AccountRef: { value: '6999' } }
          }
        ]
      }
    },
    {
      name: 'deposit',
      fn: 'createQuickBooksDepositTransaction',
      path: '/v3/company/realm-1/deposit',
      responseKey: 'Deposit',
      expectedBody: {
        TxnDate: '2026-03-25',
        PrivateNote: 'cash deposit',
        DepositToAccountRef: { value: '1000' },
        Line: [
          {
            Amount: 120.5,
            DetailType: 'DepositLineDetail',
            Description: 'cash deposit',
            DepositLineDetail: { AccountRef: { value: '4000' } }
          }
        ]
      }
    },
    {
      name: 'transfer',
      fn: 'createQuickBooksTransferTransaction',
      path: '/v3/company/realm-1/transfer',
      responseKey: 'Transfer',
      expectedBody: {
        TxnDate: '2026-03-25',
        Amount: 88,
        FromAccountRef: { value: '1000' },
        ToAccountRef: { value: '2000' },
        PrivateNote: 'move cash'
      }
    },
    {
      name: 'check',
      fn: 'createQuickBooksCheckTransaction',
      path: '/v3/company/realm-1/purchase',
      responseKey: 'Purchase',
      expectedBody: {
        TxnDate: '2026-03-25',
        PaymentType: 'Check',
        AccountRef: { value: '1000' },
        PrivateNote: 'vendor check',
        EntityRef: { value: 'vendor-1' },
        Line: [
          {
            Amount: 44.1,
            Description: 'vendor check',
            DetailType: 'AccountBasedExpenseLineDetail',
            AccountBasedExpenseLineDetail: { AccountRef: { value: '6999' } }
          }
        ]
      }
    }
  ])('keeps typed posting payloads unchanged for $name', async ({ fn, path, responseKey, expectedBody }) => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        [responseKey]: {
          Id: `${responseKey.toLowerCase()}-1`,
          TxnDate: '2026-03-25'
        }
      })
    );

    const client = await import('./client');
    const helper = client[fn as keyof typeof client] as (...args: any[]) => Promise<any>;

    const args =
      fn === 'createQuickBooksTransferTransaction'
        ? {
            companyId: 'company-1',
            txnDate: '2026-03-25',
            amount: 88,
            fromAccountId: '1000',
            toAccountId: '2000',
            memo: 'move cash'
          }
        : {
            companyId: 'company-1',
            txnDate: '2026-03-25',
            amount: fn === 'createQuickBooksDepositTransaction' ? 120.5 : fn === 'createQuickBooksCheckTransaction' ? 44.1 : 19.95,
            bankAccountId: '1000',
            categoryAccountId: fn === 'createQuickBooksDepositTransaction' ? '4000' : '6999',
            payeeRefId: 'vendor-1',
            memo: fn === 'createQuickBooksDepositTransaction' ? 'cash deposit' : fn === 'createQuickBooksCheckTransaction' ? 'vendor check' : 'office'
          };

    await helper(args);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(path);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(expectedBody);
  });

  it.each([
    {
      name: 'sales receipt',
      fn: 'createQuickBooksSalesReceiptTransaction',
      path: '/v3/company/realm-1/salesreceipt',
      responseKey: 'SalesReceipt',
      args: {
        companyId: 'company-1',
        txnDate: '2026-03-25',
        customerRefId: 'customer-1',
        depositToAccountId: '1000',
        docNumber: 'SR-1009',
        memo: 'front counter sale',
        privateNoteTag: '[req-sales-1]',
        lines: [
          {
            amount: 120.5,
            itemRefId: 'item-1',
            description: 'Retail sale',
            quantity: 1,
            unitPrice: 120.5,
            serviceDate: '2026-03-25',
            taxCodeRefId: 'NON',
            classRefId: 'retail'
          }
        ]
      },
      expectedBody: {
        TxnDate: '2026-03-25',
        PrivateNote: '[req-sales-1] front counter sale',
        CustomerRef: { value: 'customer-1' },
        DepositToAccountRef: { value: '1000' },
        DocNumber: 'SR-1009',
        Line: [
          {
            Amount: 120.5,
            Description: 'Retail sale',
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: { value: 'item-1' },
              Qty: 1,
              UnitPrice: 120.5,
              ServiceDate: '2026-03-25',
              TaxCodeRef: { value: 'NON' },
              ClassRef: { value: 'retail' }
            }
          }
        ]
      }
    },
    {
      name: 'invoice',
      fn: 'createQuickBooksInvoiceTransaction',
      path: '/v3/company/realm-1/invoice',
      responseKey: 'Invoice',
      args: {
        companyId: 'company-1',
        txnDate: '2026-03-25',
        customerRefId: 'customer-9',
        dueDate: '2026-04-09',
        docNumber: 'INV-1009',
        customerMemo: 'Thanks for your business',
        memo: 'phase 3 invoice',
        privateNoteTag: '[req-invoice-1]',
        lines: [
          {
            amount: 75.25,
            itemRefId: 'service-1',
            description: 'Consulting',
            quantity: 2,
            unitPrice: 37.625
          }
        ]
      },
      expectedBody: {
        TxnDate: '2026-03-25',
        DueDate: '2026-04-09',
        CustomerRef: { value: 'customer-9' },
        PrivateNote: '[req-invoice-1] phase 3 invoice',
        CustomerMemo: { value: 'Thanks for your business' },
        DocNumber: 'INV-1009',
        Line: [
          {
            Amount: 75.25,
            Description: 'Consulting',
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: { value: 'service-1' },
              Qty: 2,
              UnitPrice: 37.625
            }
          }
        ]
      }
    },
    {
      name: 'payment',
      fn: 'createQuickBooksPaymentTransaction',
      path: '/v3/company/realm-1/payment',
      responseKey: 'Payment',
      args: {
        companyId: 'company-1',
        txnDate: '2026-03-25',
        amount: 75.25,
        customerRefId: 'customer-9',
        depositToAccountId: '1000',
        paymentMethodRefId: 'pm-1',
        docNumber: 'PAY-22',
        memo: 'invoice settlement',
        privateNoteTag: '[req-payment-1]',
        linkedTxns: [{ txnId: 'invoice-1', txnType: 'Invoice', amount: 75.25 }]
      },
      expectedBody: {
        TxnDate: '2026-03-25',
        TotalAmt: 75.25,
        CustomerRef: { value: 'customer-9' },
        DepositToAccountRef: { value: '1000' },
        PaymentMethodRef: { value: 'pm-1' },
        PrivateNote: '[req-payment-1] invoice settlement',
        DocNumber: 'PAY-22',
        Line: [
          {
            Amount: 75.25,
            LinkedTxn: [{ TxnId: 'invoice-1', TxnType: 'Invoice' }]
          }
        ]
      }
    }
  ])('posts the expected QuickBooks payload for $name helpers', async ({ fn, path, responseKey, args, expectedBody }) => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        [responseKey]: {
          Id: `${responseKey.toLowerCase()}-1`,
          TxnDate: '2026-03-25'
        }
      })
    );

    const client = await import('./client');
    const helper = client[fn as keyof typeof client] as (...args: any[]) => Promise<any>;

    await helper(args);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(path);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(expectedBody);
  });

  it('falls back to safe returned dates for new transaction helpers', async () => {
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        SalesReceipt: {
          Id: 'salesreceipt-1',
          MetaData: { CreateTime: '2026-03-26T09:15:00-05:00' }
        }
      })
    );
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        Invoice: {
          Id: 'invoice-1',
          TxnDate: 'not-a-date',
          MetaData: { CreateTime: '2026-03-27T10:45:00Z' }
        }
      })
    );
    fetchMock.mockResolvedValueOnce(
      makeResponse({
        Payment: {
          Id: 'payment-1',
          TxnDate: 'still-not-a-date'
        }
      })
    );

    const {
      createQuickBooksInvoiceTransaction,
      createQuickBooksPaymentTransaction,
      createQuickBooksSalesReceiptTransaction
    } = await import('./client');

    await expect(
      createQuickBooksSalesReceiptTransaction({
        companyId: 'company-1',
        txnDate: '2026-03-25',
        customerRefId: 'customer-1',
        lines: [{ amount: 10, itemRefId: 'item-1' }]
      })
    ).resolves.toEqual({
      txnId: 'salesreceipt-1',
      txnDate: '2026-03-26'
    });

    await expect(
      createQuickBooksInvoiceTransaction({
        companyId: 'company-1',
        txnDate: '2026-03-25',
        customerRefId: 'customer-2',
        lines: [{ amount: 15, itemRefId: 'item-2' }]
      })
    ).resolves.toEqual({
      txnId: 'invoice-1',
      txnDate: '2026-03-27'
    });

    await expect(
      createQuickBooksPaymentTransaction({
        companyId: 'company-1',
        txnDate: '2026-03-25',
        amount: 15,
        customerRefId: 'customer-2'
      })
    ).resolves.toEqual({
      txnId: 'payment-1',
      txnDate: '2026-03-25'
    });
  });
});
