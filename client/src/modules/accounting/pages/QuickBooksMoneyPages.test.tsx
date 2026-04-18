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
import { QuickBooksMoneyCreatePage, QuickBooksMoneyEditPage } from './QuickBooksMoneyPages';

const selectOption = async (label: string, optionText: string) => {
  fireEvent.mouseDown(screen.getByLabelText(label));
  const option = await screen.findByRole('option', { name: optionText });
  fireEvent.click(option);
};

const {
  getQuickbooksHubChartOfAccountsMock,
  getQuickbooksHubEntitiesMock,
  getQuickbooksTransactionDetailMock,
  postQuickbooksMoneyTransactionMock,
  patchQuickbooksMoneyTransactionMock,
  useQuickBooksWorkspaceMock
} = vi.hoisted(() => ({
  getQuickbooksHubChartOfAccountsMock: vi.fn(),
  getQuickbooksHubEntitiesMock: vi.fn(),
  getQuickbooksTransactionDetailMock: vi.fn(),
  postQuickbooksMoneyTransactionMock: vi.fn(),
  patchQuickbooksMoneyTransactionMock: vi.fn(),
  useQuickBooksWorkspaceMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksHubChartOfAccounts: (...args: unknown[]) => getQuickbooksHubChartOfAccountsMock(...args),
    getQuickbooksHubEntities: (...args: unknown[]) => getQuickbooksHubEntitiesMock(...args),
    getQuickbooksTransactionDetail: (...args: unknown[]) => getQuickbooksTransactionDetailMock(...args),
    postQuickbooksMoneyTransaction: (...args: unknown[]) => postQuickbooksMoneyTransactionMock(...args),
    patchQuickbooksMoneyTransaction: (...args: unknown[]) => patchQuickbooksMoneyTransactionMock(...args)
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

const accountsPayload = {
  data: {
    data: {
      page: 1,
      pageSize: 200,
      total: 2,
      totalPages: 1,
      items: [
        { id: 'acc-1', qbId: '35', name: 'Checking', type: 'Bank', subType: 'Checking', classification: 'Asset', status: 'active' },
        { id: 'acc-2', qbId: '7000', name: 'Office Supplies', type: 'Expense', subType: 'Office', classification: 'Expense', status: 'active' }
      ]
    }
  }
};

const vendorsPayload = {
  data: {
    data: {
      page: 1,
      pageSize: 200,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: 'ven-1',
          qbId: 'ven-1',
          entityType: 'vendor',
          displayName: 'Northwind Supply',
          companyName: 'Northwind Supply',
          givenName: null,
          familyName: null,
          email: 'payables@northwind.test',
          phone: '555-2222',
          status: 'active',
          balance: 0
        }
      ]
    }
  }
};

describe('QuickBooks money pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickBooksWorkspaceMock.mockReturnValue(workspaceState);
    getQuickbooksHubChartOfAccountsMock.mockResolvedValue(accountsPayload);
    getQuickbooksHubEntitiesMock.mockResolvedValue(vendorsPayload);
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a check and lands on the detail route', async () => {
    postQuickbooksMoneyTransactionMock.mockResolvedValue({
      data: { data: { qbTxnId: '9001' } }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/money/checks/new']}>
          <Routes>
            <Route path="/dashboard/quickbooks/money/checks/new" element={<QuickBooksMoneyCreatePage />} />
            <Route path="/dashboard/quickbooks/money/checks/:qbTxnId" element={<div>Check detail route</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksHubChartOfAccountsMock).toHaveBeenCalled();
      expect(getQuickbooksHubEntitiesMock).toHaveBeenCalledWith('vendor', expect.any(Object));
    });

    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '125.50' }
    });
    await selectOption('Bank Account', 'Checking');
    await selectOption('Category Account', 'Office Supplies');
    await selectOption('Vendor', 'Northwind Supply');
    fireEvent.change(screen.getByLabelText('Memo'), {
      target: { value: 'Paper goods' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Write Check' }));

    await waitFor(() => {
      expect(postQuickbooksMoneyTransactionMock).toHaveBeenCalledWith('check', {
        txnType: 'check',
        txnDate: expect.any(String),
        amount: 125.5,
        memo: 'Paper goods',
        bankAccountId: '35',
        categoryAccountId: '7000',
        payeeRefId: 'ven-1'
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Check detail route')).toBeInTheDocument();
    });
  });

  it('loads and saves a transfer edit flow', async () => {
    getQuickbooksTransactionDetailMock.mockResolvedValue({
      data: {
        data: {
          id: 'txn-1',
          qbTxnId: 'txn-1',
          type: 'transfer',
          txnDate: '2026-04-10',
          docNum: 'TR-1',
          syncToken: '3',
          payeeId: null,
          payeeName: null,
          memo: 'Move cash',
          amount: 200,
          accountId: null,
          accountName: null,
          categoryAccountId: null,
          categoryAccountName: null,
          fromAccountId: '35',
          fromAccountName: 'Checking',
          toAccountId: '7000',
          toAccountName: 'Office Supplies',
          raw: { Id: 'txn-1' }
        }
      }
    });
    patchQuickbooksMoneyTransactionMock.mockResolvedValue({
      data: { data: { qbTxnId: 'txn-1' } }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/money/transfers/txn-1/edit']}>
          <Routes>
            <Route path="/dashboard/quickbooks/money/transfers/:qbTxnId/edit" element={<QuickBooksMoneyEditPage />} />
            <Route path="/dashboard/quickbooks/money/transfers/:qbTxnId" element={<div>Transfer detail route</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksTransactionDetailMock).toHaveBeenCalledWith('transfer', 'txn-1');
    });

    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '250' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(patchQuickbooksMoneyTransactionMock).toHaveBeenCalledWith('transfer', 'txn-1', {
        txnType: 'transfer',
        txnDate: '2026-04-10',
        amount: 250,
        memo: 'Move cash',
        fromAccountId: '35',
        toAccountId: '7000'
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Transfer detail route')).toBeInTheDocument();
    });
  });
});
