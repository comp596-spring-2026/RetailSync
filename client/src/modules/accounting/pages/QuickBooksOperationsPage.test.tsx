import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { QuickBooksOperationsPage } from './QuickBooksOperationsPage';

const {
  getQuickbooksSettingsMock,
  getQuickbooksOAuthStatusMock,
  getQuickbooksHubOperationsMock
} = vi.hoisted(() => ({
  getQuickbooksSettingsMock: vi.fn(),
  getQuickbooksOAuthStatusMock: vi.fn(),
  getQuickbooksHubOperationsMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksSettings: (...args: unknown[]) => getQuickbooksSettingsMock(...args),
    getQuickbooksOAuthStatus: (...args: unknown[]) => getQuickbooksOAuthStatusMock(...args),
    getQuickbooksHubOperations: (...args: unknown[]) => getQuickbooksHubOperationsMock(...args)
  }
}));

const createPermissions = ({
  quickbooksView = true,
  ledgerView = true
}: {
  quickbooksView?: boolean;
  ledgerView?: boolean;
} = {}) => {
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
    view: quickbooksView,
    create: false,
    edit: false,
    delete: false,
    actions: ['connect', 'sync', 'post']
  };
  permissions.ledger = {
    view: ledgerView,
    create: false,
    edit: false,
    delete: false,
    actions: ['post']
  };

  return permissions;
};

const createStore = (options?: { quickbooksView?: boolean; ledgerView?: boolean }) => {
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
      permissions: createPermissions(options)
    })
  );

  return store;
};

describe('QuickBooksOperationsPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    getQuickbooksSettingsMock.mockResolvedValue({
      data: {
        data: {
          connected: true,
          environment: 'sandbox',
          realmId: 'realm-1',
          companyName: 'RetailSync QB',
          lastPullStatus: 'idle',
          lastPullAt: null,
          lastPullCount: 0,
          lastPullError: null,
          lastPushStatus: 'idle',
          lastPushAt: null,
          lastPushCount: 0,
          lastPushError: null,
          updatedAt: '2026-03-10T00:00:00.000Z'
        }
      }
    });
    getQuickbooksOAuthStatusMock.mockResolvedValue({
      data: {
        data: {
          ok: true,
          reason: null,
          connected: true,
          degraded: false,
          status: 'connected',
          needsReconnect: false,
          environment: 'sandbox',
          realmId: 'realm-1',
          companyName: 'RetailSync QB',
          expiresInSec: 3600,
          health: {
            status: 'healthy',
            checkedAt: '2026-03-10T00:00:00.000Z',
            refreshedAt: '2026-03-10T00:00:00.000Z',
            accessTokenExpiresAt: '2026-03-10T01:00:00.000Z',
            accessTokenExpiresInSec: 3600,
            refreshTokenExpiresAt: '2026-04-10T00:00:00.000Z',
            refreshTokenExpiresInSec: 2678400,
            lastRefreshError: null,
            lastRefreshErrorAt: null
          }
        }
      }
    });
    getQuickbooksHubOperationsMock.mockResolvedValue({
      data: {
        data: {
          items: [
            {
              id: 'op-1',
              date: '2026-03-10',
              description: 'Fuel expense',
              payee: 'Fuel Stop',
              amount: 99,
              status: 'posted',
              qbId: 'qb-1',
              error: null,
              type: 'Expense'
            }
          ],
          page: 1,
          pageSize: 25,
          total: 1,
          totalPages: 1
        }
      }
    });
  });

  it('requires quickbooks view permission to access operations', () => {
    render(
      <Provider store={createStore({ quickbooksView: false, ledgerView: true })}>
        <MemoryRouter>
          <QuickBooksOperationsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('No Access')).toBeInTheDocument();
    expect(getQuickbooksHubOperationsMock).not.toHaveBeenCalled();
  });

  it('keeps operations accessible when connection exists but oauth health is degraded', async () => {
    getQuickbooksOAuthStatusMock.mockResolvedValue({
      data: {
        data: {
          ok: false,
          reason: null,
          connected: true,
          degraded: true,
          status: 'degraded',
          needsReconnect: false,
          environment: 'sandbox',
          realmId: 'realm-1',
          companyName: 'RetailSync QB',
          expiresInSec: null,
          health: {
            status: 'degraded',
            checkedAt: '2026-03-10T00:00:00.000Z',
            refreshedAt: '2026-03-10T00:00:00.000Z',
            accessTokenExpiresAt: null,
            accessTokenExpiresInSec: null,
            refreshTokenExpiresAt: null,
            refreshTokenExpiresInSec: null,
            lastRefreshError: 'Recent token refresh failed',
            lastRefreshErrorAt: '2026-03-10T00:00:00.000Z'
          }
        }
      }
    });

    render(
      <Provider store={createStore({ quickbooksView: true, ledgerView: true })}>
        <MemoryRouter>
          <QuickBooksOperationsPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksHubOperationsMock).toHaveBeenCalled();
      expect(screen.getByText('Fuel expense')).toBeInTheDocument();
    });
    expect(screen.getByText('QuickBooks is connected but degraded: Recent token refresh failed.')).toBeInTheDocument();
  });
});
