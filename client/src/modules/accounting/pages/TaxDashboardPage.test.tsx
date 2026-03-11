import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { TaxDashboardPage } from './TaxDashboardPage';

const {
  getQuickbooksTaxOverviewMock,
  getQuickbooksTaxReportMock,
  getQuickbooksTaxChartOfAccountsMock,
  getQuickbooksTaxLedgerMock,
  getQuickbooksTaxPaymentsMock,
  recoverQuickbooksPaymentMock,
  createQuickbooksJournalAdjustmentMock
} = vi.hoisted(() => ({
  getQuickbooksTaxOverviewMock: vi.fn(),
  getQuickbooksTaxReportMock: vi.fn(),
  getQuickbooksTaxChartOfAccountsMock: vi.fn(),
  getQuickbooksTaxLedgerMock: vi.fn(),
  getQuickbooksTaxPaymentsMock: vi.fn(),
  recoverQuickbooksPaymentMock: vi.fn(),
  createQuickbooksJournalAdjustmentMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getQuickbooksTaxOverview: (...args: unknown[]) => getQuickbooksTaxOverviewMock(...args),
    getQuickbooksTaxReport: (...args: unknown[]) => getQuickbooksTaxReportMock(...args),
    getQuickbooksTaxChartOfAccounts: (...args: unknown[]) =>
      getQuickbooksTaxChartOfAccountsMock(...args),
    getQuickbooksTaxLedger: (...args: unknown[]) => getQuickbooksTaxLedgerMock(...args),
    getQuickbooksTaxPayments: (...args: unknown[]) => getQuickbooksTaxPaymentsMock(...args),
    recoverQuickbooksPayment: (...args: unknown[]) => recoverQuickbooksPaymentMock(...args),
    createQuickbooksJournalAdjustment: (...args: unknown[]) =>
      createQuickbooksJournalAdjustmentMock(...args)
  }
}));

const createPermissions = (quickbooksView: boolean): PermissionsMap => {
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
  return permissions;
};

const createStore = (quickbooksView = true) => {
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
      permissions: createPermissions(quickbooksView)
    })
  );

  return store;
};

describe('TaxDashboardPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    getQuickbooksTaxOverviewMock.mockResolvedValue({
      data: {
        data: {
          from: '2026-01-01',
          to: '2026-03-10',
          basis: 'accrual',
          cards: {
            netIncome: 1200,
            totalAssets: 2300,
            totalLiabilities: 500,
            totalEquity: 1800,
            arOpen: 150,
            apOpen: 90
          }
        }
      }
    });
    getQuickbooksTaxReportMock.mockResolvedValue({
      data: {
        data: {
          reportKey: 'profit-loss',
          from: '2026-01-01',
          to: '2026-03-10',
          basis: 'accrual',
          generatedAt: '2026-03-10T00:00:00.000Z',
          rows: [{ label: 'Net Income', amount: 1200, path: [] }],
          raw: {}
        }
      }
    });
    getQuickbooksTaxChartOfAccountsMock.mockResolvedValue({
      data: {
        data: [
          {
            id: '1',
            code: '1000',
            name: 'Cash',
            accountType: 'Asset',
            active: true
          }
        ]
      }
    });
    getQuickbooksTaxLedgerMock.mockResolvedValue({
      data: {
        data: {
          from: '2026-01-01',
          to: '2026-03-10',
          basis: 'accrual',
          accountId: null,
          total: 1,
          nextCursor: null,
          entries: [
            {
              id: 'row-1',
              txnDate: '2026-03-01',
              description: 'Opening',
              amount: 100,
              accountId: null,
              accountName: 'Cash'
            }
          ]
        }
      }
    });
    getQuickbooksTaxPaymentsMock.mockResolvedValue({
      data: {
        data: {
          from: '2026-01-01',
          to: '2026-03-10',
          type: 'all',
          nextCursor: null,
          payments: []
        }
      }
    });
  });

  it('renders no access when quickbooks view permission is denied', () => {
    render(
      <Provider store={createStore(false)}>
        <MemoryRouter>
          <TaxDashboardPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('No Access')).toBeInTheDocument();
  });

  it('renders summary cards after loading tax data', async () => {
    render(
      <Provider store={createStore(true)}>
        <MemoryRouter>
          <TaxDashboardPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('Tax Dashboard')).toBeInTheDocument();

    await waitFor(() => {
      expect(getQuickbooksTaxOverviewMock).toHaveBeenCalled();
      expect(screen.getAllByText('$1,200.00').length).toBeGreaterThan(0);
    });
  });
});
