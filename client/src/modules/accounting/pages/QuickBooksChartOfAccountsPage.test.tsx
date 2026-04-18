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
import { QuickBooksChartOfAccountsPage } from './QuickBooksChartOfAccountsPage';

const {
  getQuickbooksHubChartOfAccountsMock,
  useQuickBooksWorkspaceMock
} = vi.hoisted(() => ({
  getQuickbooksHubChartOfAccountsMock: vi.fn(),
  useQuickBooksWorkspaceMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksHubChartOfAccounts: (...args: unknown[]) =>
      getQuickbooksHubChartOfAccountsMock(...args)
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

const createStore = (permissions = createPermissions()) => {
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
      permissions
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

describe('QuickBooks chart of accounts page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickBooksWorkspaceMock.mockReturnValue(workspaceState);
    getQuickbooksHubChartOfAccountsMock.mockResolvedValue({
      data: {
        data: {
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1,
          items: [
            {
              id: 'acct-1',
              qbId: '35',
              name: 'Checking',
              type: 'Bank',
              detailType: 'Checking',
              balance: 1200.55,
              status: 'active'
            }
          ]
        }
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads accounts and navigates to the register view', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/accounts']}>
          <Routes>
            <Route path="/dashboard/quickbooks/accounts" element={<QuickBooksChartOfAccountsPage />} />
            <Route path="/dashboard/quickbooks/accounts/:accountId/register" element={<div>Register route</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksHubChartOfAccountsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 25
        })
      );
    });

    expect(screen.getAllByText('Checking').length).toBeGreaterThan(0);
    expect(screen.getByText('Bank')).toBeInTheDocument();
    expect(screen.getAllByText('$1,200.55').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(screen.getByText('Register route')).toBeInTheDocument();
    });
  });

  it('shows no access when the user cannot view QuickBooks', () => {
    const permissions = createPermissions();
    permissions.quickbooks = {
      ...(permissions.quickbooks ?? {
        view: true,
        create: false,
        edit: false,
        delete: false,
        actions: []
      }),
      view: false
    };

    render(
      <Provider store={createStore(permissions)}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/accounts']}>
          <QuickBooksChartOfAccountsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('No Access')).toBeInTheDocument();
  });
});
