import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureFreshQuickBooksSecretMock, requestQuickBooksApiMock, runQuickBooksReadQueryMock } =
  vi.hoisted(() => ({
    ensureFreshQuickBooksSecretMock: vi.fn(),
    requestQuickBooksApiMock: vi.fn(),
    runQuickBooksReadQueryMock: vi.fn()
  }));

vi.mock('../integrations/quickbooks', () => ({
  ensureFreshQuickBooksSecret: ensureFreshQuickBooksSecretMock,
  requestQuickBooksApi: requestQuickBooksApiMock,
  runQuickBooksReadQuery: runQuickBooksReadQueryMock
}));

describe('quickbooksWriteService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshQuickBooksSecretMock.mockResolvedValue({ realmId: 'realm-1' });
  });

  it('lists and normalizes invoice rows from live quickbooks queries', async () => {
    runQuickBooksReadQueryMock
      .mockResolvedValueOnce({
        QueryResponse: {
          Invoice: [
            {
              Id: 'inv-1',
              TxnDate: '2026-03-10',
              DocNumber: 'INV-1',
              CustomerRef: { value: 'customer-1', name: 'Acme Stores' },
              TotalAmt: '95.50',
              Balance: '95.50',
              CurrencyRef: { name: 'USD' },
              EmailStatus: 'NeedToSend',
              PrivateNote: 'March restock'
            },
            {
              Id: 'inv-2',
              TxnDate: '2026-03-08',
              DocNumber: 'INV-2',
              CustomerRef: { value: 'customer-1', name: 'Acme Stores' },
              TotalAmt: '40.00',
              Balance: '0',
              CurrencyRef: { name: 'USD' },
              EmailStatus: 'EmailSent',
              PrivateNote: 'Older invoice'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        QueryResponse: {
          totalCount: 2
        }
      });

    const { listQuickBooksWriteTransactions } = await import('./quickbooksWriteService');
    const result = await listQuickBooksWriteTransactions({
      companyId: 'company-1',
      txnType: 'invoice',
      page: 1,
      pageSize: 25,
      sort: '-totalAmount',
      customerId: 'customer-1',
      startDate: '2026-03-01'
    });

    expect(runQuickBooksReadQueryMock).toHaveBeenNthCalledWith(
      1,
      'company-1',
      expect.stringContaining("select * from Invoice where TxnDate >= '2026-03-01' and CustomerRef = 'customer-1'")
    );
    expect(result).toEqual({
      page: 1,
      pageSize: 25,
      total: 2,
      totalPages: 1,
      txnType: 'invoice',
      items: [
        {
          id: 'inv-1',
          qbTxnId: 'inv-1',
          txnType: 'invoice',
          txnDate: '2026-03-10',
          docNumber: 'INV-1',
          customerId: 'customer-1',
          customerName: 'Acme Stores',
          totalAmount: 95.5,
          balanceAmount: 95.5,
          currencyCode: 'USD',
          status: 'open',
          emailStatus: 'NeedToSend',
          memo: 'March restock'
        },
        {
          id: 'inv-2',
          qbTxnId: 'inv-2',
          txnType: 'invoice',
          txnDate: '2026-03-08',
          docNumber: 'INV-2',
          customerId: 'customer-1',
          customerName: 'Acme Stores',
          totalAmount: 40,
          balanceAmount: 0,
          currencyCode: 'USD',
          status: 'paid',
          emailStatus: 'EmailSent',
          memo: 'Older invoice'
        }
      ]
    });
  });

  it('loads invoice detail and maps sales lines', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      Invoice: {
        Id: 'inv-9',
        SyncToken: '3',
        TxnDate: '2026-03-14',
        DueDate: '2026-03-31',
        DocNumber: 'INV-9',
        CustomerRef: { value: 'customer-9', name: 'Northwind' },
        TotalAmt: '125.00',
        Balance: '125.00',
        CurrencyRef: { name: 'USD' },
        EmailStatus: 'NeedToSend',
        PrivateNote: 'Net 30',
        CustomerMemo: { value: 'Thank you' },
        BillEmail: { Address: 'ap@northwind.test' },
        ARAccountRef: { value: 'ar-1', name: 'Accounts Receivable' },
        Line: [
          {
            Id: '1',
            Amount: '125.00',
            Description: 'Consulting',
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: { value: 'item-1', name: 'Consulting Service' },
              Qty: 5,
              UnitPrice: 25,
              TaxCodeRef: { value: 'NON', name: 'Non' },
              ServiceDate: '2026-03-14'
            }
          }
        ]
      }
    });

    const { getQuickBooksWriteTransactionDetail } = await import('./quickbooksWriteService');
    const result = await getQuickBooksWriteTransactionDetail({
      companyId: 'company-1',
      txnType: 'invoice',
      qbTxnId: 'inv-9'
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/v3/company/realm-1/invoice/inv-9'
      })
    );
    expect(result).toEqual({
      id: 'inv-9',
      qbTxnId: 'inv-9',
      txnType: 'invoice',
      txnDate: '2026-03-14',
      docNumber: 'INV-9',
      customerId: 'customer-9',
      customerName: 'Northwind',
      totalAmount: 125,
      balanceAmount: 125,
      currencyCode: 'USD',
      status: 'open',
      emailStatus: 'NeedToSend',
      memo: 'Net 30',
      syncToken: '3',
      dueDate: '2026-03-31',
      customerMemo: 'Thank you',
      customerEmail: 'ap@northwind.test',
      depositAccountId: null,
      depositAccountName: null,
      arAccountId: 'ar-1',
      arAccountName: 'Accounts Receivable',
      paymentMethodId: null,
      paymentMethodName: null,
      lines: [
        {
          id: '1',
          detailType: 'SalesItemLineDetail',
          description: 'Consulting',
          amount: 125,
          itemId: 'item-1',
          itemName: 'Consulting Service',
          quantity: 5,
          unitPrice: 25,
          taxCodeId: 'NON',
          taxCodeName: 'Non',
          serviceDate: '2026-03-14'
        }
      ],
      linkedTransactions: [],
      raw: expect.objectContaining({
        Id: 'inv-9'
      })
    });
  });

  it('creates a sales receipt with sales item lines', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      SalesReceipt: {
        Id: 'sr-1',
        SyncToken: '0',
        TxnDate: '2026-03-20',
        DocNumber: 'SR-1',
        CustomerRef: { value: 'customer-4', name: 'Walk-in Customer' },
        TotalAmt: '50.00',
        CurrencyRef: { name: 'USD' },
        EmailStatus: 'NotSet',
        PrivateNote: 'front counter',
        DepositToAccountRef: { value: '35', name: 'Checking' },
        PaymentMethodRef: { value: 'pm-1', name: 'Card' },
        Line: [
          {
            Id: '1',
            Amount: '50.00',
            Description: 'Counter sale',
            DetailType: 'SalesItemLineDetail',
            SalesItemLineDetail: {
              ItemRef: { value: 'item-7', name: 'Retail item' },
              Qty: 2,
              UnitPrice: 25
            }
          }
        ]
      }
    });

    const { createQuickBooksWriteTransaction } = await import('./quickbooksWriteService');
    const result = await createQuickBooksWriteTransaction('company-1', {
      txnType: 'sales-receipt',
      customerId: 'customer-4',
      txnDate: '2026-03-20',
      docNumber: 'SR-1',
      memo: 'front counter',
      depositAccountId: '35',
      paymentMethodId: 'pm-1',
      lines: [
        {
          amount: 50,
          description: 'Counter sale',
          itemId: 'item-7',
          quantity: 2
        }
      ]
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/salesreceipt',
        body: expect.objectContaining({
          CustomerRef: { value: 'customer-4' },
          DepositToAccountRef: { value: '35' },
          PaymentMethodRef: { value: 'pm-1' },
          Line: [
            expect.objectContaining({
              Amount: 50,
              DetailType: 'SalesItemLineDetail',
              SalesItemLineDetail: expect.objectContaining({
                ItemRef: { value: 'item-7' },
                Qty: 2,
                UnitPrice: 25
              })
            })
          ]
        })
      })
    );
    expect(result.status).toBe('closed');
    expect(result.paymentMethodId).toBe('pm-1');
  });

  it('sends sparse updates for payments and maps linked transactions', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      Payment: {
        Id: 'pay-1',
        SyncToken: '2',
        TxnDate: '2026-03-22',
        PaymentRefNum: 'PAY-1',
        CustomerRef: { value: 'customer-8', name: 'Customer 8' },
        TotalAmt: '80.00',
        UnappliedAmt: '0',
        CurrencyRef: { name: 'USD' },
        PrivateNote: 'ACH received',
        DepositToAccountRef: { value: '35', name: 'Checking' },
        PaymentMethodRef: { value: 'pm-ach', name: 'ACH' },
        Line: [
          {
            Amount: '80.00',
            LinkedTxn: [
              {
                TxnId: 'inv-8',
                TxnType: 'Invoice'
              }
            ]
          }
        ]
      }
    });

    const { updateQuickBooksWriteTransaction } = await import('./quickbooksWriteService');
    const result = await updateQuickBooksWriteTransaction({
      companyId: 'company-1',
      txnType: 'payment',
      qbTxnId: 'pay-1',
      input: {
        txnType: 'payment',
        syncToken: '1',
        totalAmount: 80,
        memo: 'ACH received',
        paymentMethodId: 'pm-ach',
        linkedTransactions: [
          {
            txnId: 'inv-8',
            txnType: 'Invoice',
            amount: 80
          }
        ]
      }
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/payment',
        body: expect.objectContaining({
          sparse: true,
          Id: 'pay-1',
          SyncToken: '1',
          TotalAmt: 80,
          PaymentMethodRef: { value: 'pm-ach' },
          Line: [
            {
              Amount: 80,
              LinkedTxn: [{ TxnId: 'inv-8', TxnType: 'Invoice' }]
            }
          ]
        })
      })
    );
    expect(result.status).toBe('applied');
    expect(result.linkedTransactions).toEqual([
      {
        txnId: 'inv-8',
        txnType: 'Invoice',
        amount: 80
      }
    ]);
  });

  it('deletes a write transaction with the sync token QuickBooks requires', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      SalesReceipt: {
        Id: 'sr-1',
        status: 'Deleted'
      }
    });

    const { deleteQuickBooksWriteTransaction } = await import('./quickbooksWriteService');
    const result = await deleteQuickBooksWriteTransaction({
      companyId: 'company-1',
      txnType: 'sales-receipt',
      qbTxnId: 'sr-1',
      syncToken: '4'
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/salesreceipt',
        query: expect.objectContaining({
          operation: 'delete',
          minorversion: 75
        }),
        body: {
          Id: 'sr-1',
          SyncToken: '4'
        }
      })
    );
    expect(result).toEqual({
      txnType: 'sales-receipt',
      qbTxnId: 'sr-1',
      deleted: true
    });
  });
});
