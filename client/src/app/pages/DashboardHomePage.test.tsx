import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import authReducer from '../../modules/auth/state';
import companyReducer from '../../modules/users/state/companySlice';
import settingsReducer from '../../modules/settings/state/settingsSlice';
import { DashboardHomePage } from './DashboardHomePage';

const posOverviewMock = vi.hoisted(() => vi.fn());
const posDailyMock = vi.hoisted(() => vi.fn());
const posTrendMock = vi.hoisted(() => vi.fn());
const fetchSettingsMock = vi.hoisted(() => vi.fn());
const dashboardSummaryMock = vi.hoisted(() => vi.fn());
const getQuickbooksTaxOverviewMock = vi.hoisted(() => vi.fn());
const useQuickBooksWorkspaceMock = vi.hoisted(() => vi.fn());

vi.mock('../../modules/pos/api', () => ({
  posApi: {
    overview: (...args: unknown[]) => posOverviewMock(...args),
    daily: (...args: unknown[]) => posDailyMock(...args),
    trend: (...args: unknown[]) => posTrendMock(...args)
  }
}));

vi.mock('../api/dashboardApi', () => ({
  dashboardApi: {
    getSummary: (...args: unknown[]) => dashboardSummaryMock(...args)
  }
}));

vi.mock('../../modules/settings/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../modules/settings/state')>();
  return {
    ...actual,
    fetchSettings: () => fetchSettingsMock()
  };
});

vi.mock('../../modules/accounting/api', () => ({
  accountingApi: {
    getQuickbooksTaxOverview: (...args: unknown[]) => getQuickbooksTaxOverviewMock(...args)
  }
}));

vi.mock('../../modules/quickbooks/hooks/useQuickBooksWorkspace', () => ({
  useQuickBooksWorkspace: (...args: unknown[]) => useQuickBooksWorkspaceMock(...args)
}));

vi.mock('react-apexcharts', () => ({
  default: () => null
}));

const buildPermissions = (overrides: Partial<Record<string, Partial<PermissionsMap[keyof PermissionsMap]>>>) => {
  const permissions = {} as PermissionsMap;
  for (const key of moduleKeys) {
    permissions[key] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
  }
  permissions.dashboard = {
    view: true,
    create: false,
    edit: false,
    delete: false,
    actions: [],
    ...(overrides.dashboard ?? {})
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (key === 'dashboard' || !value) continue;
    const moduleKey = key as keyof PermissionsMap;
    permissions[moduleKey] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: [],
      ...value
    };
  }
  return permissions;
};

const configuredSettings = {
  googleSheets: {
    mode: 'oauth' as const,
    serviceAccountEmail: '',
    connected: true,
    connectedEmail: 'owner@test.com',
    sources: [
      {
        sourceId: 'src-1',
        name: 'POS',
        spreadsheetId: 'sheet-1',
        sheetGid: null,
        range: 'A1:Z',
        mapping: { date: 'A', totalSales: 'B' },
        active: true
      }
    ]
  },
  quickbooks: null,
  lastImportAt: '2026-05-01T12:00:00.000Z',
  lastImportSource: 'google_sheets' as const
};

const renderPage = (permissions: PermissionsMap, settingsData: typeof configuredSettings | null = configuredSettings) => {
  fetchSettingsMock.mockReturnValue({ type: 'settings/fetchSettings/fulfilled', payload: settingsData });

  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      settings: settingsReducer
    } as never,
    preloadedState: {
      auth: {
        accessToken: 'token',
        user: {
          _id: 'u1',
          firstName: 'Pat',
          lastName: 'Lee',
          email: 'pat@test.com',
          companyId: 'c1',
          roleId: 'r1'
        },
        role: { _id: 'r1', name: 'Admin', isSystem: true },
        permissions,
        status: 'authenticated',
        error: null,
        loggingOut: false,
        isRehydrated: true,
        isContextReady: true,
        isSyncingContext: false
      },
      company: { company: { name: 'Hop In' } },
      settings: {
        settings: settingsData,
        loading: false,
        error: null,
        oauthStatus: null,
        quickbooksOauthStatus: null,
        syncOverview: null,
        syncProgress: null,
        isBusy: false
      }
    } as never
  });

  return render(
    <Provider store={store}>
      <MemoryRouter>
        <DashboardHomePage />
      </MemoryRouter>
    </Provider>
  );
};

describe('DashboardHomePage executive summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboardSummaryMock.mockResolvedValue({
      data: { data: { companyId: 'c1', companyName: 'Hop In' } }
    });
    posOverviewMock.mockResolvedValue({
      data: {
        data: {
          kpis: {
            totalSales: 1200,
            creditCard: 500,
            cash: 400,
            gas: 100,
            lottery: 50,
            lotteryPayout: 0,
            cashExpenses: 0,
            cashPayout: 0,
            cashDiff: 0,
            netIncome: 200,
            avgDailySales: 40
          },
          sparkline7: [],
          alerts: [],
          start: '2026-04-20',
          end: '2026-05-20'
        }
      }
    });
    posDailyMock.mockResolvedValue({
      data: {
        data: [
          {
            _id: '1',
            date: '2026-05-01',
            day: 'Thu',
            highTax: 10,
            lowTax: 5,
            saleTax: 2,
            totalSales: 100,
            gas: 10,
            lottery: 5,
            creditCard: 50,
            lotteryPayout: 0,
            clTotal: 0,
            cash: 40,
            cashPayout: 0,
            cashExpenses: 0,
            notes: ''
          }
        ]
      }
    });
    posTrendMock.mockResolvedValue({
      data: {
        data: {
          granularity: 'daily',
          data: [{ x: '2026-05-01', totalSales: 100, creditCard: 50, cash: 40, gas: 10, lottery: 5 }],
          start: '2026-04-20',
          end: '2026-05-20'
        }
      }
    });
    useQuickBooksWorkspaceMock.mockReturnValue({
      settings: { connected: true },
      oauthStatus: { connected: true, companyName: 'Hop In QB', reason: null, needsReconnect: false, degraded: false },
      loading: false,
      error: null,
      load: vi.fn(),
      isConnected: true,
      isDegraded: false,
      needsReconnect: false,
      connectionStatus: 'connected',
      health: { refreshedAt: '2026-05-20T10:00:00.000Z' },
      warning: null
    });
    getQuickbooksTaxOverviewMock.mockResolvedValue({
      data: {
        data: {
          from: '2026-01-01',
          to: '2026-05-20',
          basis: 'accrual',
          cards: {
            netIncome: 5000,
            totalAssets: 10000,
            totalLiabilities: 3000,
            totalEquity: 7000,
            arOpen: 200,
            apOpen: 150
          }
        }
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows NoAccess without dashboard.view', () => {
    renderPage(buildPermissions({ dashboard: { view: false } }));
    expect(screen.getByText(/do not have permission to view this module/i)).toBeInTheDocument();
    expect(dashboardSummaryMock).not.toHaveBeenCalled();
    expect(posOverviewMock).not.toHaveBeenCalled();
    expect(getQuickbooksTaxOverviewMock).not.toHaveBeenCalled();
  });

  it('renders dashboard header with dashboard.view after server gate', async () => {
    renderPage(buildPermissions({}));
    await waitFor(() => {
      expect(dashboardSummaryMock).toHaveBeenCalled();
    });
    expect(screen.getByRole('heading', { name: /^dashboard$/i })).toBeInTheDocument();
    expect(screen.getByText(/executive summary/i)).toBeInTheDocument();
  });

  it('does not fetch POS data without pos.view and shows locked POS card', async () => {
    renderPage(buildPermissions({}));
    await waitFor(() => {
      expect(screen.getByText(/you do not have access to pos data/i)).toBeInTheDocument();
    });
    expect(posOverviewMock).not.toHaveBeenCalled();
  });

  it('shows POS summary when pos.view is granted', async () => {
    renderPage(buildPermissions({ pos: { view: true } }));
    await waitFor(() => {
      expect(posOverviewMock).toHaveBeenCalled();
    });
    expect(screen.getByText(/POS \/ Google Sheets/i)).toBeInTheDocument();
    expect(screen.getByText(/Total sales/i)).toBeInTheDocument();
  });

  it('shows Connect POS Data when sheets are not configured', async () => {
    renderPage(buildPermissions({ pos: { view: true } }), {
      ...configuredSettings,
      googleSheets: {
        ...configuredSettings.googleSheets,
        connected: false,
        sources: []
      }
    });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /connect pos data/i })).toHaveAttribute('href', '/dashboard/settings');
    });
    expect(posOverviewMock).not.toHaveBeenCalled();
  });

  it('does not fetch QuickBooks overview without quickbooks.view', async () => {
    renderPage(buildPermissions({ pos: { view: true } }));
    await waitFor(() => {
      expect(screen.getByText(/you do not have access to quickbooks data/i)).toBeInTheDocument();
    });
    expect(getQuickbooksTaxOverviewMock).not.toHaveBeenCalled();
  });

  it('shows QuickBooks summary when quickbooks.view is granted and connected', async () => {
    renderPage(buildPermissions({ quickbooks: { view: true } }));
    await waitFor(() => {
      expect(getQuickbooksTaxOverviewMock).toHaveBeenCalled();
    });
    expect(screen.getByText(/QuickBooks accounting/i)).toBeInTheDocument();
    expect(screen.getByText(/Net income \(YTD\)/i)).toBeInTheDocument();
  });

  it('shows Connect QuickBooks when disconnected', async () => {
    useQuickBooksWorkspaceMock.mockReturnValue({
      settings: { connected: false },
      oauthStatus: null,
      loading: false,
      error: null,
      load: vi.fn(),
      isConnected: false,
      isDegraded: false,
      needsReconnect: false,
      connectionStatus: 'not_connected',
      health: null,
      warning: null
    });
    renderPage(buildPermissions({ quickbooks: { view: true } }));
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /connect quickbooks/i })).toHaveAttribute('href', '/dashboard/settings');
    });
    expect(getQuickbooksTaxOverviewMock).not.toHaveBeenCalled();
  });

});
