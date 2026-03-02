import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import posReducer, { fetchDaily, fetchOverview, setIconOnly, setView, type PosState } from '../state';

const mockedPosApi = vi.hoisted(() => ({
  dailyPaged: vi.fn(),
  overview: vi.fn(),
  daily: vi.fn(),
  exportCsv: vi.fn(),
  importCsv: vi.fn(),
  commitImport: vi.fn()
}));

const mockedSettingsApi = vi.hoisted(() => ({
  get: vi.fn()
}));

vi.mock('../api', () => ({
  posApi: mockedPosApi
}));

vi.mock('../../settings/api', () => ({
  settingsApi: mockedSettingsApi
}));

describe('posSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates view and iconOnly reducers', () => {
    const initial = posReducer(undefined, { type: '@@INIT' }) as PosState;
    const afterView = posReducer(initial, setView('dashboard')) as PosState;
    const afterIconOnly = posReducer(afterView, setIconOnly(true)) as PosState;

    expect(afterView.view).toBe('dashboard');
    expect(afterIconOnly.iconOnly).toBe(true);
  });

  it('fetchDaily stores rows and totals from API', async () => {
    mockedPosApi.dailyPaged.mockResolvedValueOnce({
      data: {
        data: {
          data: [
            {
              _id: '1',
              date: '2026-02-27',
              day: 'Fri',
              highTax: 10,
              lowTax: 10,
              saleTax: 1,
              totalSales: 100,
              gas: 40,
              lottery: 20,
              creditCard: 30,
              lotteryPayout: 10,
              clTotal: 0,
              cash: 20,
              cashPayout: 0,
              cashExpenses: 0,
              notes: ''
            }
          ],
          totals: {
            totalSales: 100,
            creditCard: 30,
            cash: 20,
            gas: 40,
            lottery: 20,
            lotteryPayout: 10,
            cashExpenses: 0,
            cashPayout: 0,
            highTax: 10,
            lowTax: 10,
            saleTax: 1
          },
          page: 1,
          limit: 100,
          totalCount: 1,
          totalPages: 1,
          start: '2026-02-01',
          end: '2026-02-28'
        }
      }
    });

    const store = configureStore({
      reducer: {
        pos: posReducer
      }
    });

    await (store.dispatch as unknown as (action: unknown) => Promise<unknown>)(fetchDaily());

    const state = store.getState().pos;
    expect(state.records).toHaveLength(1);
    expect(state.totals.totalSales).toBe(100);
    expect(state.totalCount).toBe(1);
  });

  it('fetchOverview stores kpis and alerts', async () => {
    mockedPosApi.overview.mockResolvedValueOnce({
      data: {
        data: {
          kpis: {
            totalSales: 100,
            creditCard: 30,
            cash: 20,
            gas: 40,
            lottery: 20,
            lotteryPayout: 10,
            cashExpenses: 3,
            cashPayout: 1,
            cashDiff: 2,
            netIncome: 90,
            avgDailySales: 50
          },
          sparkline7: [{ x: '2026-02-27T00:00:00.000Z', y: 100 }],
          alerts: [
            {
              id: 'a1',
              type: 'cash_diff',
              severity: 'medium',
              message: 'Cash difference high',
              data: {}
            }
          ],
          start: '2026-02-01',
          end: '2026-02-28'
        }
      }
    });
    mockedPosApi.daily.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: '1',
            date: '2026-02-27',
            day: 'Fri',
            highTax: 10,
            lowTax: 10,
            saleTax: 1,
            totalSales: 100,
            gas: 40,
            lottery: 20,
            creditCard: 30,
            lotteryPayout: 10,
            clTotal: 0,
            cash: 20,
            cashPayout: 0,
            cashExpenses: 0,
            notes: ''
          }
        ]
      }
    });

    const store = configureStore({
      reducer: {
        pos: posReducer
      }
    });

    await (store.dispatch as unknown as (action: unknown) => Promise<unknown>)(fetchOverview());
    const state = store.getState().pos;

    expect(state.kpis.totalSales).toBe(100);
    expect(state.alerts).toHaveLength(1);
    expect(state.chartsData.totalSales).toHaveLength(1);
  });
});
