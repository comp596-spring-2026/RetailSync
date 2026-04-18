import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ensureFreshQuickBooksSecretMock, requestQuickBooksApiMock } = vi.hoisted(() => ({
  ensureFreshQuickBooksSecretMock: vi.fn(),
  requestQuickBooksApiMock: vi.fn()
}));

vi.mock('../integrations/quickbooks', () => ({
  ensureFreshQuickBooksSecret: ensureFreshQuickBooksSecretMock,
  requestQuickBooksApi: requestQuickBooksApiMock
}));

describe('quickbooksMoneyService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshQuickBooksSecretMock.mockResolvedValue({ realmId: 'realm-1' });
  });

  it('creates a check transaction with expense-line payload mapping', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      Purchase: {
        Id: '9001',
        SyncToken: '0',
        TxnDate: '2026-04-17',
        DocNumber: 'CHK-1',
        AccountRef: { value: '35', name: 'Checking' },
        EntityRef: { value: 'ven-1', name: 'Northwind Supply' },
        TotalAmt: '125.50',
        PrivateNote: 'Paper goods',
        Line: [
          {
            Amount: '125.50',
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: '7000', name: 'Office Supplies' }
            }
          }
        ]
      }
    });

    const { createQuickBooksMoneyTransaction } = await import('./quickbooksMoneyService');
    const result = await createQuickBooksMoneyTransaction({
      companyId: 'company-1',
      input: {
        txnType: 'check',
        txnDate: '2026-04-17',
        amount: 125.5,
        memo: 'Paper goods',
        bankAccountId: '35',
        categoryAccountId: '7000',
        payeeRefId: 'ven-1'
      }
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/purchase',
        body: {
          TxnDate: '2026-04-17',
          PaymentType: 'Check',
          AccountRef: { value: '35' },
          EntityRef: { value: 'ven-1' },
          PrivateNote: 'Paper goods',
          Line: [
            {
              Amount: 125.5,
              Description: 'Paper goods',
              DetailType: 'AccountBasedExpenseLineDetail',
              AccountBasedExpenseLineDetail: {
                AccountRef: { value: '7000' }
              }
            }
          ]
        }
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        qbTxnId: '9001',
        type: 'check',
        syncToken: '0',
        payeeId: 'ven-1',
        payeeName: 'Northwind Supply',
        accountId: '35',
        categoryAccountId: '7000'
      })
    );
  });

  it('updates and deletes transfer transactions using the sync token', async () => {
    requestQuickBooksApiMock
      .mockResolvedValueOnce({
        Transfer: {
          Id: 'tx-1',
          SyncToken: '4',
          TxnDate: '2026-04-17',
          Amount: '250',
          FromAccountRef: { value: '35', name: 'Checking' },
          ToAccountRef: { value: '41', name: 'Savings' }
        }
      })
      .mockResolvedValueOnce({
        Transfer: {
          Id: 'tx-1',
          SyncToken: '5',
          TxnDate: '2026-04-17',
          Amount: '300',
          FromAccountRef: { value: '35', name: 'Checking' },
          ToAccountRef: { value: '41', name: 'Savings' },
          PrivateNote: 'Reserve cash'
        }
      })
      .mockResolvedValueOnce({
        Transfer: {
          Id: 'tx-1',
          SyncToken: '5',
          TxnDate: '2026-04-17',
          Amount: '300',
          FromAccountRef: { value: '35', name: 'Checking' },
          ToAccountRef: { value: '41', name: 'Savings' }
        }
      })
      .mockResolvedValueOnce({});

    const {
      updateQuickBooksMoneyTransaction,
      deleteQuickBooksMoneyTransaction
    } = await import('./quickbooksMoneyService');

    const updated = await updateQuickBooksMoneyTransaction({
      companyId: 'company-1',
      txnType: 'transfer',
      qbTxnId: 'tx-1',
      input: {
        txnType: 'transfer',
        txnDate: '2026-04-17',
        amount: 300,
        memo: 'Reserve cash',
        fromAccountId: '35',
        toAccountId: '41'
      }
    });

    expect(requestQuickBooksApiMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/transfer',
        body: {
          Id: 'tx-1',
          SyncToken: '4',
          sparse: true,
          TxnDate: '2026-04-17',
          Amount: 300,
          FromAccountRef: { value: '35' },
          ToAccountRef: { value: '41' },
          PrivateNote: 'Reserve cash'
        }
      })
    );
    expect(updated).toEqual(
      expect.objectContaining({
        qbTxnId: 'tx-1',
        type: 'transfer',
        syncToken: '5',
        amount: 300,
        fromAccountId: '35',
        toAccountId: '41'
      })
    );

    const deleted = await deleteQuickBooksMoneyTransaction({
      companyId: 'company-1',
      txnType: 'transfer',
      qbTxnId: 'tx-1'
    });

    expect(requestQuickBooksApiMock).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/transfer',
        query: {
          minorversion: 75,
          operation: 'delete'
        },
        body: {
          Id: 'tx-1',
          SyncToken: '5'
        }
      })
    );
    expect(deleted).toEqual({
      txnType: 'transfer',
      qbTxnId: 'tx-1',
      deleted: true
    });
  });
});
