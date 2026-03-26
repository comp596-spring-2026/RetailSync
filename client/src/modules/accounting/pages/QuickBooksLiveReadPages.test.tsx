import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import {
  QuickBooksAccountRegisterPage,
  QuickBooksChecksPage,
  QuickBooksDepositsPage,
  QuickBooksTransactionDetailPage,
  QuickBooksExpensesPage,
  QuickBooksTransfersPage
} from './QuickBooksLiveReadPages';

const {
  getQuickbooksAccountRegisterMock,
  getQuickbooksLiveTransactionsMock,
  getQuickbooksTransactionDetailMock,
  useQuickBooksWorkspaceMock
} = vi.hoisted(() => ({
  getQuickbooksAccountRegisterMock: vi.fn(),
  getQuickbooksLiveTransactionsMock: vi.fn(),
  getQuickbooksTransactionDetailMock: vi.fn(),
  useQuickBooksWorkspaceMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksAccountRegister: (...args: unknown[]) => getQuickbooksAccountRegisterMock(...args),
    getQuickbooksLiveTransactions: (...args: unknown[]) => getQuickbooksLiveTransactionsMock(...args),
    getQuickbooksTransactionDetail: (...args: unknown[]) => getQuickbooksTransactionDetailMock(...args)
  }
}));

vi.mock('../hooks/useQuickBooksWorkspace', () => ({
  useQuickBooksWorkspace: (...args: unknown[]) => useQuickBooksWorkspaceMock(...args)
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

describe('QuickBooks live read pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickBooksWorkspaceMock.mockReturnValue(workspaceState);
  });

  afterEach(() => {
    cleanup();
  });

  it('hides register drill-in when the row has a synthetic ledger id', async () => {
    getQuickbooksAccountRegisterMock.mockResolvedValue({
      data: {
        data: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
          accountId: '35',
          from: '2026-01-01',
          to: '2026-03-25',
          basis: 'cash',
          items: [
            {
              id: 'reg-1',
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
            }
          ]
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/accounting/registers/35']}>
          <Routes>
            <Route path="/dashboard/accounting/registers/:accountId" element={<QuickBooksAccountRegisterPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksAccountRegisterMock).toHaveBeenCalledWith(
        '35',
        expect.objectContaining({
          page: 1,
          pageSize: 25
        })
      );
    });

    expect(screen.getByText('Acme Supplies')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('navigates from a register row only when the txn id is a real QuickBooks id', async () => {
    getQuickbooksAccountRegisterMock.mockResolvedValue({
      data: {
        data: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
          accountId: '35',
          from: '2026-01-01',
          to: '2026-03-25',
          basis: 'cash',
          items: [
            {
              id: 'reg-2',
              accountId: '35',
              date: '2026-03-02',
              txnType: 'Check',
              qbTxnId: '12345',
              docNum: '1003',
              name: 'Staples',
              memo: 'Supplies',
              splitAccount: 'Office Expense',
              amount: 18.5,
              debit: 18.5,
              credit: null,
              balance: 937.4
            }
          ]
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/accounting/registers/35']}>
          <Routes>
            <Route path="/dashboard/accounting/registers/:accountId" element={<QuickBooksAccountRegisterPage />} />
            <Route path="/dashboard/accounting/transactions/:type/:qbTxnId" element={<div>Detail route</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    await waitFor(() => {
      expect(screen.getByText('Detail route')).toBeInTheDocument();
    });
  });

  it.each([
    [
      'deposit',
      '/dashboard/accounting/transactions/deposits',
      QuickBooksDepositsPage,
      'Deposits',
      'Fuel Stop'
    ],
    ['check', '/dashboard/accounting/transactions/checks', QuickBooksChecksPage, 'Checks', 'Landlord'],
    [
      'expense',
      '/dashboard/accounting/transactions/expenses',
      QuickBooksExpensesPage,
      'Expenses',
      'Office Depot'
    ],
    [
      'transfer',
      '/dashboard/accounting/transactions/transfers',
      QuickBooksTransfersPage,
      'Transfers',
      'Main Checking'
    ]
  ])(
    'renders %s live transactions and loads data',
    async (
      type,
      path,
      Component,
      title,
      payee
    ) => {
      getQuickbooksLiveTransactionsMock.mockResolvedValue({
        data: {
          data: {
            page: 1,
            pageSize: 25,
            total: 1,
            totalPages: 1,
            type,
            items: [
              {
                id: 'txn-1',
                qbTxnId: '9001',
                type,
                txnDate: '2026-03-10',
                docNum: '2001',
                payeeName: payee,
                accountName: 'Checking',
                amount: 123.45,
                memo: `${title} memo`,
                status: 'posted'
              }
            ]
          }
        }
      });

      render(
        <Provider store={createStore()}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={path} element={<Component />} />
            </Routes>
          </MemoryRouter>
        </Provider>
      );

      await waitFor(() => {
        expect(getQuickbooksLiveTransactionsMock).toHaveBeenCalledWith(
          type,
          expect.objectContaining({
            page: 1,
            pageSize: 25
          })
        );
      });

      expect(screen.getByText(`QuickBooks ${title}`)).toBeInTheDocument();
      expect(screen.getByText(payee)).toBeInTheDocument();
    }
  );

  it('loads transaction detail with the type query contract and supports back navigation', async () => {
    getQuickbooksTransactionDetailMock.mockResolvedValue({
      data: {
        data: {
          id: 'txn-9',
          qbTxnId: '9001',
          type: 'check',
          txnDate: '2026-03-10',
          docNum: '3001',
          payeeName: 'Staples',
          memo: 'Office supplies',
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
            Id: '9001',
            TxnDate: '2026-03-10',
            DocNumber: '3001'
          }
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/accounting/transactions/check/9001']}>
          <Routes>
            <Route path="/dashboard/accounting/transactions/checks" element={<div>Checks list</div>} />
            <Route path="/dashboard/accounting/transactions/:type/:qbTxnId" element={<QuickBooksTransactionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksTransactionDetailMock).toHaveBeenCalledWith('check', '9001');
    });

    expect(screen.getByRole('heading', { name: 'Staples' })).toBeInTheDocument();
    expect(screen.getByText('Office supplies')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));

    await waitFor(() => {
      expect(screen.getByText('Checks list')).toBeInTheDocument();
    });
  });
});
