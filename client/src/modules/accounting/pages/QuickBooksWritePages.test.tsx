import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import {
  QuickBooksWriteCreatePage,
  QuickBooksWriteDetailPage,
  QuickBooksWriteEditPage,
  QuickBooksWriteListPage
} from './QuickBooksWritePages';

const {
  getQuickbooksWriteTransactionsMock,
  getQuickbooksWriteTransactionDetailMock,
  postQuickbooksWriteTransactionMock,
  patchQuickbooksWriteTransactionMock,
  useQuickBooksWorkspaceMock
} = vi.hoisted(() => ({
  getQuickbooksWriteTransactionsMock: vi.fn(),
  getQuickbooksWriteTransactionDetailMock: vi.fn(),
  postQuickbooksWriteTransactionMock: vi.fn(),
  patchQuickbooksWriteTransactionMock: vi.fn(),
  useQuickBooksWorkspaceMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksWriteTransactions: (...args: unknown[]) => getQuickbooksWriteTransactionsMock(...args),
    getQuickbooksWriteTransactionDetail: (...args: unknown[]) =>
      getQuickbooksWriteTransactionDetailMock(...args),
    postQuickbooksWriteTransaction: (...args: unknown[]) =>
      postQuickbooksWriteTransactionMock(...args),
    patchQuickbooksWriteTransaction: (...args: unknown[]) =>
      patchQuickbooksWriteTransactionMock(...args)
  }
}));

vi.mock('../hooks/useQuickBooksWorkspace', () => ({
  useQuickBooksWorkspace: (...args: unknown[]) => useQuickBooksWorkspaceMock(...args)
}));

vi.mock('../components', () => ({
  QuickBooksTabs: () => null,
  RequireQuickBooksConnection: ({ children }: { children: ReactNode }) => <>{children}</>
}));

const createPermissions = (): PermissionsMap => {
  const permissions = {} as PermissionsMap;
  for (const moduleKey of moduleKeys) {
    permissions[moduleKey] = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    };
  }

  permissions.quickbooks = {
    view: true,
    create: false,
    edit: false,
    delete: false,
    actions: ['connect', 'sync', 'post']
  };

  return permissions;
};

const createStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });

  store.dispatch(
    setAuthContext({
      user: {
        _id: 'u1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        companyId: 'c1',
        roleId: 'r1'
      },
      role: null,
      permissions: createPermissions()
    })
  );

  return store;
};

const workspaceState = {
  loading: false,
  isConnected: true,
  error: null,
  warning: null,
  load: vi.fn(),
  settings: { connected: true },
  oauthStatus: { ok: true, reason: null }
};

describe('QuickBooks write pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickBooksWorkspaceMock.mockReturnValue(workspaceState);
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ['invoice', 'Invoices', '/dashboard/quickbooks/sales/invoices'],
    ['payment', 'Payments', '/dashboard/quickbooks/sales/payments']
  ])('loads the %s write list route and renders rows', async (txnType, title, path) => {
    getQuickbooksWriteTransactionsMock.mockResolvedValue({
      data: {
        data: {
          txnType,
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
          items: [
            {
              id: `${txnType}-1`,
              qbTxnId: `qb-${txnType}-1`,
              txnType,
              txnDate: '2026-03-10',
              docNumber: '1001',
              customerId: 'cust-1',
              customerName: 'Acme Co',
              totalAmount: 125.5,
              balanceAmount: 0,
              currencyCode: 'USD',
              status: 'paid',
              emailStatus: 'sent',
              memo: 'Test memo'
            }
          ]
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/dashboard/quickbooks/sales/invoices" element={<QuickBooksWriteListPage />} />
            <Route path="/dashboard/quickbooks/sales/payments" element={<QuickBooksWriteListPage />} />
            <Route path="/dashboard/quickbooks/sales/invoices/:qbTxnId" element={<div>Detail route</div>} />
            <Route path="/dashboard/quickbooks/sales/payments/:qbTxnId" element={<div>Detail route</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksWriteTransactionsMock).toHaveBeenCalledWith(
        txnType,
        expect.objectContaining({
          page: 1,
          pageSize: 25
        })
      );
    });

    expect(screen.getByText(`QuickBooks ${title}`)).toBeInTheDocument();
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View' }));

    await waitFor(() => {
      expect(screen.getByText('Detail route')).toBeInTheDocument();
    });
  });

  it('loads write detail and surfaces the edit action', async () => {
    getQuickbooksWriteTransactionDetailMock.mockResolvedValue({
      data: {
        data: {
          id: 'inv-1',
          qbTxnId: 'qb-1',
          txnType: 'invoice',
          txnDate: '2026-03-10',
          docNumber: '1001',
          customerId: 'cust-1',
          customerName: 'Acme Co',
          totalAmount: 125.5,
          balanceAmount: 0,
          currencyCode: 'USD',
          status: 'closed',
          emailStatus: 'sent',
          memo: 'Memo',
          syncToken: '3',
          dueDate: null,
          customerMemo: null,
          customerEmail: null,
          depositAccountId: null,
          depositAccountName: null,
          arAccountId: null,
          arAccountName: null,
          paymentMethodId: null,
          paymentMethodName: null,
          lines: [
            {
              id: 'line-1',
              detailType: 'SalesItemLineDetail',
              description: 'Item line',
              amount: 125.5,
              itemId: 'item-1',
              itemName: 'Service',
              quantity: 1,
              unitPrice: 125.5,
              taxCodeId: 'TAX',
              taxCodeName: 'Taxable',
              serviceDate: '2026-03-10'
            }
          ],
          linkedTransactions: [],
          raw: { id: 'qb-1' }
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/sales/invoices/qb-1']}>
          <Routes>
            <Route path="/dashboard/quickbooks/sales/invoices/:qbTxnId" element={<QuickBooksWriteDetailPage />} />
            <Route path="/dashboard/quickbooks/sales/invoices/:qbTxnId/edit" element={<div>Edit route</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Acme Co')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('Item line')).toBeInTheDocument();
  });

  it('creates a write transaction and refetches by landing on detail', async () => {
    getQuickbooksWriteTransactionDetailMock.mockResolvedValue({
      data: {
        data: {
          id: 'inv-2',
          qbTxnId: 'qb-created',
          txnType: 'invoice',
          txnDate: '2026-03-11',
          docNumber: '1002',
          customerId: 'cust-2',
          customerName: 'Created Customer',
          totalAmount: 45,
          balanceAmount: 0,
          currencyCode: 'USD',
          status: 'closed',
          emailStatus: 'sent',
          memo: 'Created memo',
          syncToken: '1',
          dueDate: null,
          customerMemo: null,
          customerEmail: null,
          depositAccountId: null,
          depositAccountName: null,
          arAccountId: null,
          arAccountName: null,
          paymentMethodId: null,
          paymentMethodName: null,
          lines: [],
          linkedTransactions: [],
          raw: { id: 'qb-created' }
        }
      }
    });
    postQuickbooksWriteTransactionMock.mockResolvedValue({
      data: {
        data: {
          id: 'inv-2',
          qbTxnId: 'qb-created',
          txnType: 'invoice',
          txnDate: '2026-03-11',
          docNumber: '1002',
          customerId: 'cust-2',
          customerName: 'Created Customer',
          totalAmount: 45,
          balanceAmount: 0,
          currencyCode: 'USD',
          status: 'closed',
          emailStatus: 'sent',
          memo: 'Created memo',
          syncToken: '1',
          dueDate: null,
          customerMemo: null,
          customerEmail: null,
          depositAccountId: null,
          depositAccountName: null,
          arAccountId: null,
          arAccountName: null,
          paymentMethodId: null,
          paymentMethodName: null,
          lines: [],
          linkedTransactions: [],
          raw: { id: 'qb-created' }
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/sales/invoices/new']}>
          <Routes>
            <Route path="/dashboard/quickbooks/sales/invoices/new" element={<QuickBooksWriteCreatePage />} />
            <Route path="/dashboard/quickbooks/sales/invoices/:qbTxnId" element={<QuickBooksWriteDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    fireEvent.change(await screen.findByLabelText(/Customer ID/i), { target: { value: 'cust-2' } });
    fireEvent.change(await screen.findByLabelText(/Item ID/i), { target: { value: 'item-1' } });
    fireEvent.change(await screen.findByLabelText(/Amount/i), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Invoice' }));

    await waitFor(() => {
      expect(postQuickbooksWriteTransactionMock).toHaveBeenCalledWith(
        'invoice',
        expect.objectContaining({
          customerId: 'cust-2',
          txnType: 'invoice'
        })
      );
    });

    await waitFor(() => {
      expect(getQuickbooksWriteTransactionDetailMock).toHaveBeenCalledWith('invoice', 'qb-created');
      expect(screen.getByText('Created Customer')).toBeInTheDocument();
    });
  });

  it('loads an edit form and patches before refetching detail', async () => {
    getQuickbooksWriteTransactionDetailMock
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 'inv-1',
            qbTxnId: 'qb-edit',
            txnType: 'invoice',
            txnDate: '2026-03-12',
            docNumber: '2001',
            customerId: 'cust-3',
            customerName: 'Edit Customer',
            totalAmount: 99,
            balanceAmount: 0,
            currencyCode: 'USD',
            status: 'open',
            emailStatus: 'not_sent',
            memo: 'Original memo',
            syncToken: '5',
            dueDate: '2026-03-20',
            customerMemo: null,
            customerEmail: null,
            depositAccountId: null,
            depositAccountName: null,
            arAccountId: null,
            arAccountName: null,
            paymentMethodId: null,
            paymentMethodName: null,
            lines: [
              {
                id: 'line-1',
                detailType: 'SalesItemLineDetail',
                description: 'Invoice line',
                amount: 99,
                itemId: 'item-1',
                itemName: 'Service',
                quantity: 1,
                unitPrice: 99,
                taxCodeId: null,
                taxCodeName: null,
                serviceDate: null
              }
            ],
            linkedTransactions: [],
            raw: { id: 'qb-edit' }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 'inv-1',
            qbTxnId: 'qb-edit',
            txnType: 'invoice',
            txnDate: '2026-03-12',
            docNumber: '2001',
            customerId: 'cust-3',
            customerName: 'Edit Customer',
            totalAmount: 99,
            balanceAmount: 0,
            currencyCode: 'USD',
            status: 'open',
            emailStatus: 'not_sent',
            memo: 'Updated memo',
            syncToken: '6',
            dueDate: '2026-03-20',
            customerMemo: null,
            customerEmail: null,
            depositAccountId: null,
            depositAccountName: null,
            arAccountId: null,
            arAccountName: null,
            paymentMethodId: null,
            paymentMethodName: null,
            lines: [
              {
                id: 'line-1',
                detailType: 'SalesItemLineDetail',
                description: 'Invoice line',
                amount: 99,
                itemId: 'item-1',
                itemName: 'Service',
                quantity: 1,
                unitPrice: 99,
                taxCodeId: null,
                taxCodeName: null,
                serviceDate: null
              }
            ],
            linkedTransactions: [],
            raw: { id: 'qb-edit' }
          }
        }
      });
    patchQuickbooksWriteTransactionMock.mockResolvedValue({
      data: {
        data: {
          id: 'inv-1',
          qbTxnId: 'qb-edit',
          txnType: 'invoice',
          txnDate: '2026-03-12',
          docNumber: '2001',
          customerId: 'cust-3',
          customerName: 'Edit Customer',
          totalAmount: 99,
          balanceAmount: 0,
          currencyCode: 'USD',
          status: 'open',
          emailStatus: 'not_sent',
          memo: 'Updated memo',
          syncToken: '6',
          dueDate: '2026-03-20',
          customerMemo: null,
          customerEmail: null,
          depositAccountId: null,
          depositAccountName: null,
          arAccountId: null,
          arAccountName: null,
          paymentMethodId: null,
          paymentMethodName: null,
          lines: [
            {
              id: 'line-1',
              detailType: 'SalesItemLineDetail',
              description: 'Invoice line',
              amount: 99,
              itemId: 'item-1',
              itemName: 'Service',
              quantity: 1,
              unitPrice: 99,
              taxCodeId: null,
              taxCodeName: null,
              serviceDate: null
            }
          ],
          linkedTransactions: [],
          raw: { id: 'qb-edit' }
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/sales/invoices/qb-edit/edit']}>
          <Routes>
            <Route path="/dashboard/quickbooks/sales/invoices/:qbTxnId/edit" element={<QuickBooksWriteEditPage />} />
            <Route path="/dashboard/quickbooks/sales/invoices/:qbTxnId" element={<QuickBooksWriteDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('cust-3')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole('textbox', { name: 'Memo' }), { target: { value: 'Updated memo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Invoice' }));

    await waitFor(() => {
      expect(patchQuickbooksWriteTransactionMock).toHaveBeenCalledWith(
        'invoice',
        'qb-edit',
        expect.objectContaining({
          syncToken: '5',
          memo: 'Updated memo'
        })
      );
    });

    await waitFor(() => {
      expect(getQuickbooksWriteTransactionDetailMock).toHaveBeenLastCalledWith('invoice', 'qb-edit');
      expect(screen.getByText('Updated memo')).toBeInTheDocument();
    });
  });
});
