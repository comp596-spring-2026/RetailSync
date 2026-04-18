import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  ensureFreshQuickBooksSecretMock,
  requestQuickBooksApiMock,
  findOneAndUpdateMock
} = vi.hoisted(() => ({
  ensureFreshQuickBooksSecretMock: vi.fn(),
  requestQuickBooksApiMock: vi.fn(),
  findOneAndUpdateMock: vi.fn()
}));

vi.mock('../integrations/quickbooks', () => ({
  ensureFreshQuickBooksSecret: ensureFreshQuickBooksSecretMock,
  requestQuickBooksApi: requestQuickBooksApiMock
}));

vi.mock('../models/QuickBooksReference', () => ({
  QuickBooksReferenceModel: {
    findOneAndUpdate: (...args: unknown[]) => findOneAndUpdateMock(...args)
  }
}));

describe('quickbooksContactCrudService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureFreshQuickBooksSecretMock.mockResolvedValue({ realmId: 'realm-1' });
  });

  it('creates a customer and persists the local reference', async () => {
    requestQuickBooksApiMock.mockResolvedValue({
      Customer: {
        Id: 'cust-9',
        SyncToken: '0',
        DisplayName: 'Acme Stores',
        CompanyName: 'Acme Stores',
        PrimaryEmailAddr: { Address: 'ap@acme.test' },
        PrimaryPhone: { FreeFormNumber: '555-1111' },
        Balance: '25.00',
        Active: true
      }
    });

    const { createQuickBooksContact } = await import('./quickbooksContactCrudService');
    const result = await createQuickBooksContact({
      companyId: 'company-1',
      entityType: 'customer',
      input: {
        displayName: 'Acme Stores',
        companyName: 'Acme Stores',
        email: 'ap@acme.test',
        phone: '555-1111'
      }
    });

    expect(requestQuickBooksApiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/customer',
        body: expect.objectContaining({
          DisplayName: 'Acme Stores',
          CompanyName: 'Acme Stores',
          PrimaryEmailAddr: { Address: 'ap@acme.test' },
          PrimaryPhone: { FreeFormNumber: '555-1111' }
        })
      })
    );
    expect(findOneAndUpdateMock).toHaveBeenCalledWith(
      {
        companyId: 'company-1',
        entityType: 'customer',
        qbId: 'cust-9'
      },
      expect.objectContaining({
        displayName: 'Acme Stores',
        active: true
      }),
      expect.objectContaining({
        upsert: true,
        new: true
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'cust-9',
        qbId: 'cust-9',
        entityType: 'customer',
        displayName: 'Acme Stores',
        email: 'ap@acme.test',
        phone: '555-1111',
        status: 'active',
        balance: 25,
        syncToken: '0'
      })
    );
  });

  it('deactivates a vendor via sparse update', async () => {
    requestQuickBooksApiMock
      .mockResolvedValueOnce({
        Vendor: {
          Id: 'ven-4',
          SyncToken: '7',
          DisplayName: 'Northwind Supply',
          Active: true
        }
      })
      .mockResolvedValueOnce({
        Vendor: {
          Id: 'ven-4',
          SyncToken: '8',
          DisplayName: 'Northwind Supply',
          Active: false
        }
      });

    const { deleteQuickBooksContact } = await import('./quickbooksContactCrudService');
    const result = await deleteQuickBooksContact({
      companyId: 'company-1',
      entityType: 'vendor',
      qbId: 'ven-4'
    });

    expect(requestQuickBooksApiMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        method: 'POST',
        path: '/v3/company/realm-1/vendor',
        body: {
          Id: 'ven-4',
          SyncToken: '7',
          sparse: true,
          Active: false
        }
      })
    );
    expect(result).toEqual({
      qbId: 'ven-4',
      deleted: true
    });
  });
});
