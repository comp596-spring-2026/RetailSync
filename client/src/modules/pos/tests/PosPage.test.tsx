import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PosPage } from '../pages/PosPage';

const dispatchMock = vi.fn();
const navigateMock = vi.fn();
const setViewMock = vi.fn();
const setDateRangeMock = vi.fn();
const fetchOverviewMock = vi.fn();
const fetchDailyMock = vi.fn();
const syncGoogleSheetMock = vi.fn();
const fetchSettingsMock = vi.fn(() => ({ type: 'settings/fetchSettings' }));

const usePosState = vi.hoisted(() => ({
  state: {
    view: 'table' as 'table' | 'analytics' | 'ai',
    iconOnly: false,
    dateRange: { from: '2026-03-01', to: '2026-03-02' },
    page: 1,
    limit: 100,
    records: [],
    totals: {
      totalSales: 0,
      creditCard: 0,
      cash: 0,
      gas: 0,
      lottery: 0,
      lotteryPayout: 0,
      cashExpenses: 0,
      cashPayout: 0,
      highTax: 0,
      lowTax: 0,
      saleTax: 0
    },
    kpis: {
      totalSales: 0,
      creditCard: 0,
      cash: 0,
      gas: 0,
      lottery: 0,
      lotteryPayout: 0,
      cashExpenses: 0,
      cashPayout: 0,
      cashDiff: 0,
      netIncome: 0,
      avgDailySales: 0
    },
    sparkline7: [],
    chartsData: {
      totalSales: [],
      streams: [],
      weeklyStreams: [],
      weekdayAverages: [],
      monthlyAverages: []
    },
    alerts: [],
    lastSyncAt: null,
    loading: {
      daily: false,
      overview: false,
      importing: false,
      syncing: false,
      exporting: false
    },
    error: null,
    totalPages: 1,
    totalCount: 0
  }
}));

vi.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      auth: {
        permissions: ['pos:view', 'pos:create', 'pos:actions:import']
      },
      settings: {
        settings: {
          googleSheets: null,
          lastImportSource: null,
          lastImportAt: null
        }
      }
    })
}));

vi.mock('../../../app/guards', () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</>
}));

vi.mock('../../../components', () => ({
  DateRangeControlPanel: ({ actions }: { actions: React.ReactNode }) => (
    <div data-testid="date-range-control-panel">{actions}</div>
  ),
  NoAccess: () => <div data-testid="no-access" />,
  PageHeader: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <header>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </header>
  )
}));

vi.mock('../../../utils/permissions', () => ({
  hasPermission: () => true
}));

vi.mock('../../settings/state', () => ({
  fetchSettings: () => fetchSettingsMock(),
  selectGoogleSheetsSettings: () => null,
  selectSettings: () => ({
    googleSheets: null,
    lastImportSource: null,
    lastImportAt: null
  })
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock
  };
});

vi.mock('../hooks/usePos', () => ({
  usePos: () => ({
    state: usePosState.state,
    actions: {
      fetchDaily: fetchDailyMock,
      fetchOverview: fetchOverviewMock,
      exportCsv: vi.fn(),
      importCsv: vi.fn(),
      syncGoogleSheet: syncGoogleSheetMock,
      acknowledgeAlert: vi.fn(),
      setView: setViewMock,
      setIconOnly: vi.fn(),
      setDateRange: setDateRangeMock,
      setPage: vi.fn(),
      setLimit: vi.fn()
    }
  })
}));

vi.mock('../pages/PosAnalyticsViewPage', () => ({
  PosAnalyticsViewPage: () => <div data-testid="pos-analytics-view">Analytics view</div>
}));

vi.mock('../pages/PosAiViewPage', () => ({
  PosAiViewPage: () => <div data-testid="pos-ai-view">AI view</div>
}));

vi.mock('../pages/PosTableViewPage', () => ({
  PosTableViewPage: () => <div data-testid="pos-table-view">Table view</div>
}));

vi.mock('../components/ImportPOSDataModal', () => ({
  ImportPOSDataModal: () => null
}));

describe('PosPage', () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    navigateMock.mockReset();
    setViewMock.mockReset();
    setDateRangeMock.mockReset();
    fetchOverviewMock.mockReset();
    fetchDailyMock.mockReset();
    syncGoogleSheetMock.mockReset();
    fetchSettingsMock.mockClear();
    usePosState.state.view = 'table';
  });

  it('dispatches the AI tab switch and keeps the POS AI route in the page shell', async () => {
    const user = userEvent.setup();

    render(<PosPage />);

    expect(screen.getByRole('heading', { name: 'POS Table View' })).toBeInTheDocument();
    expect(screen.getByTestId('pos-table-view')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /AI view/i }));

    expect(setViewMock).toHaveBeenCalledWith('ai');
  });

  it('renders the AI view when the state is already switched there', () => {
    usePosState.state.view = 'ai';

    render(<PosPage />);

    expect(screen.getByRole('heading', { name: 'POS AI View' })).toBeInTheDocument();
    expect(screen.getByTestId('pos-ai-view')).toBeInTheDocument();
  });
});
