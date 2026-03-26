import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { QuickBooksReportsPage } from './QuickBooksReportsPage';

const {
  getQuickbooksSettingsMock,
  getQuickbooksOAuthStatusMock,
  getQuickbooksTaxOverviewMock,
  getQuickbooksTaxReportMock,
  getQuickbooksTaxChartOfAccountsMock,
  getQuickbooksTaxLedgerMock
} = vi.hoisted(() => ({
  getQuickbooksSettingsMock: vi.fn(),
  getQuickbooksOAuthStatusMock: vi.fn(),
  getQuickbooksTaxOverviewMock: vi.fn(),
  getQuickbooksTaxReportMock: vi.fn(),
  getQuickbooksTaxChartOfAccountsMock: vi.fn(),
  getQuickbooksTaxLedgerMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksSettings: (...args: unknown[]) => getQuickbooksSettingsMock(...args),
    getQuickbooksOAuthStatus: (...args: unknown[]) => getQuickbooksOAuthStatusMock(...args),
    getQuickbooksTaxOverview: (...args: unknown[]) => getQuickbooksTaxOverviewMock(...args),
    getQuickbooksTaxReport: (...args: unknown[]) => getQuickbooksTaxReportMock(...args),
    getQuickbooksTaxChartOfAccounts: (...args: unknown[]) => getQuickbooksTaxChartOfAccountsMock(...args),
    getQuickbooksTaxLedger: (...args: unknown[]) => getQuickbooksTaxLedgerMock(...args)
  }
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

describe('QuickBooksReportsPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getQuickbooksTaxOverviewMock.mockResolvedValue({ data: { data: { cards: {} } } });
    getQuickbooksTaxReportMock.mockResolvedValue({ data: { data: { rows: [] } } });
    getQuickbooksTaxChartOfAccountsMock.mockResolvedValue({ data: { data: [] } });
    getQuickbooksTaxLedgerMock.mockResolvedValue({ data: { data: { entries: [] } } });
  });

  it('redirects disconnected users back to QuickBooks home', async () => {
    getQuickbooksSettingsMock.mockResolvedValue({
      data: {
        data: {
          connected: false,
          environment: 'sandbox',
          realmId: null,
          companyName: null,
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
          ok: false,
          reason: 'not_connected',
          connected: false,
          degraded: false,
          status: 'not_connected',
          needsReconnect: false,
          environment: 'sandbox',
          realmId: null,
          companyName: null,
          expiresInSec: null,
          health: null
        }
      }
    });

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/reports']}>
          <Routes>
            <Route path="/dashboard/quickbooks" element={<div>QuickBooks Home Redirect</div>} />
            <Route path="/dashboard/quickbooks/reports" element={<QuickBooksReportsPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('QuickBooks Home Redirect')).toBeInTheDocument();
    });
  });

  it('keeps reports accessible when connection exists but oauth health is degraded', async () => {
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
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/quickbooks/reports']}>
          <Routes>
            <Route path="/dashboard/quickbooks" element={<div>QuickBooks Home Redirect</div>} />
            <Route path="/dashboard/quickbooks/reports" element={<QuickBooksReportsPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(getQuickbooksTaxOverviewMock).toHaveBeenCalled();
    });
    expect(screen.queryByText('QuickBooks Home Redirect')).not.toBeInTheDocument();
    expect(screen.getByText('QuickBooks Reports')).toBeInTheDocument();
    expect(screen.getByText('QuickBooks is connected but degraded: Recent token refresh failed.')).toBeInTheDocument();
  });
});
