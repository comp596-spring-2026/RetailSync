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
  listLedgerEntriesMock
} = vi.hoisted(() => ({
  getQuickbooksSettingsMock: vi.fn(),
  getQuickbooksOAuthStatusMock: vi.fn(),
  listLedgerEntriesMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksSettings: (...args: unknown[]) => getQuickbooksSettingsMock(...args),
    getQuickbooksOAuthStatus: (...args: unknown[]) => getQuickbooksOAuthStatusMock(...args),
    listLedgerEntries: (...args: unknown[]) => listLedgerEntriesMock(...args)
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
          environment: 'sandbox',
          realmId: 'realm-1',
          companyName: 'RetailSync QB',
          expiresInSec: 3600
        }
      }
    });
    listLedgerEntriesMock.mockResolvedValue({
      data: {
        data: {
          entries: [
            {
              id: 'entry-1',
              date: '2026-03-10',
              description: 'Fuel expense',
              merchant: 'Fuel Stop',
              amount: 99,
              reviewStatus: 'approved',
              posting: {
                status: 'posted',
                qbTxnId: 'qb-1'
              },
              proposal: {
                qbTxnType: 'Expense',
                payeeName: 'Fuel Stop'
              }
            }
          ]
        }
      }
    });
  });

  it('requires ledger view permission to access operations', () => {
    render(
      <Provider store={createStore({ quickbooksView: true, ledgerView: false })}>
        <MemoryRouter>
          <QuickBooksOperationsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('No Access')).toBeInTheDocument();
    expect(listLedgerEntriesMock).not.toHaveBeenCalled();
  });

  it('keeps operations accessible when connection exists but oauth health is degraded', async () => {
    getQuickbooksOAuthStatusMock.mockResolvedValue({
      data: {
        data: {
          ok: false,
          reason: 'quickbooks_refresh_token_missing',
          environment: 'sandbox',
          realmId: 'realm-1',
          companyName: 'RetailSync QB',
          expiresInSec: null
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
      expect(listLedgerEntriesMock).toHaveBeenCalled();
      expect(screen.getByText('Fuel expense')).toBeInTheDocument();
    });
    expect(
      screen.getByText('QuickBooks connection needs attention: quickbooks refresh token missing.')
    ).toBeInTheDocument();
  });
});
