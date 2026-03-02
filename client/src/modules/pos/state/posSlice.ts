import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { posApi } from '../api';
import { settingsApi } from '../../settings/api';
import type {
  PosDailyPagedResponse,
  PosDailyRecord,
  PosOverviewResponse
} from '../api';
import type { AppDispatch, RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';

export type PosView = 'table' | 'dashboard';

export type PosDateRange = {
  from: string;
  to: string;
};

type PosTotals = PosDailyPagedResponse['totals'];

type PosKpis = PosOverviewResponse['kpis'];

type PosAlert = PosOverviewResponse['alerts'][number] & { acknowledged?: boolean };

type PosChartSeriesPoint = { x: string; y: number };

type PosChartsData = {
  totalSales: PosChartSeriesPoint[];
  streams: Array<{ x: string; gas: number; lottery: number; creditCard: number; totalSales: number }>;
  composition: Array<{ x: string; gas: number; lottery: number; other: number }>;
  weekdayAverages: Array<{ day: string; totalSales: number }>;
  monthlyAverages: Array<{ month: string; totalSales: number }>;
};

type PosLoadingState = {
  daily: boolean;
  overview: boolean;
  importing: boolean;
  syncing: boolean;
  exporting: boolean;
};

export type PosState = {
  view: PosView;
  iconOnly: boolean;
  dateRange: PosDateRange;
  page: number;
  limit: number;
  records: PosDailyRecord[];
  totals: PosTotals;
  kpis: PosKpis;
  sparkline7: PosChartSeriesPoint[];
  chartsData: PosChartsData;
  alerts: PosAlert[];
  lastSyncAt: string | null;
  loading: PosLoadingState;
  error: string | null;
  totalPages: number;
  totalCount: number;
};

const LOCAL_STORAGE_VIEW_KEY = 'retailsync.pos.view';
const LOCAL_STORAGE_ICON_ONLY_KEY = 'retailsync.pos.iconOnly';

const toLocalIso = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const defaultDateRange = (): PosDateRange => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: toLocalIso(monthStart),
    to: toLocalIso(now)
  };
};

const readPersistedBool = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
};

const readPersistedView = (): PosView => {
  if (typeof window === 'undefined') return 'table';
  const raw = window.localStorage.getItem(LOCAL_STORAGE_VIEW_KEY);
  return raw === 'dashboard' ? 'dashboard' : 'table';
};

const persistPosPreference = (key: string, value: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(key, value);
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const isValidDateRange = (start: string, end: string) =>
  isIsoDate(start) && isIsoDate(end) && start <= end;

const defaultTotals: PosTotals = {
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
};

const defaultKpis: PosKpis = {
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
};

const defaultChartsData: PosChartsData = {
  totalSales: [],
  streams: [],
  composition: [],
  weekdayAverages: [],
  monthlyAverages: []
};

const initialState: PosState = {
  view: readPersistedView(),
  iconOnly: readPersistedBool(LOCAL_STORAGE_ICON_ONLY_KEY, false),
  dateRange: defaultDateRange(),
  page: 1,
  limit: 100,
  records: [],
  totals: defaultTotals,
  kpis: defaultKpis,
  sparkline7: [],
  chartsData: defaultChartsData,
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
};

type FetchOverviewArgs = {
  start?: string;
  end?: string;
};

type FetchDailyArgs = {
  start?: string;
  end?: string;
  page?: number;
  limit?: number;
};

type ExportCsvArgs = {
  start?: string;
  end?: string;
};

const parseRows = (payload: unknown): PosDailyRecord[] => {
  if (!payload || typeof payload !== 'object') return [];
  const asResponse = payload as { data?: unknown };
  if (Array.isArray(asResponse.data)) {
    return asResponse.data as PosDailyRecord[];
  }
  if (Array.isArray(payload)) {
    return payload as PosDailyRecord[];
  }
  return [];
};

const weekdayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const buildChartsData = (rows: PosDailyRecord[]): PosChartsData => {
  const ordered = [...rows].sort((a, b) => a.date.localeCompare(b.date));

  const weekdayMap = new Map<string, { sum: number; count: number }>();
  const monthlyMap = new Map<string, { sum: number; count: number }>();

  for (const row of ordered) {
    const weekdayBucket = weekdayMap.get(row.day) ?? { sum: 0, count: 0 };
    weekdayBucket.sum += Number(row.totalSales ?? 0);
    weekdayBucket.count += 1;
    weekdayMap.set(row.day, weekdayBucket);

    const monthKey = row.date.slice(0, 7);
    const monthBucket = monthlyMap.get(monthKey) ?? { sum: 0, count: 0 };
    monthBucket.sum += Number(row.totalSales ?? 0);
    monthBucket.count += 1;
    monthlyMap.set(monthKey, monthBucket);
  }

  return {
    totalSales: ordered.map((row) => ({ x: `${row.date}T00:00:00.000Z`, y: Number(row.totalSales ?? 0) })),
    streams: ordered.map((row) => ({
      x: `${row.date}T00:00:00.000Z`,
      gas: Number(row.gas ?? 0),
      lottery: Number(row.lottery ?? 0),
      creditCard: Number(row.creditCard ?? 0),
      totalSales: Number(row.totalSales ?? 0)
    })),
    composition: ordered.map((row) => ({
      x: `${row.date}T00:00:00.000Z`,
      gas: Number(row.gas ?? 0),
      lottery: Number(row.lottery ?? 0),
      other: Math.max(0, Number(row.totalSales ?? 0) - Number(row.gas ?? 0) - Number(row.lottery ?? 0))
    })),
    weekdayAverages: weekdayOrder.map((day) => {
      const bucket = weekdayMap.get(day);
      if (!bucket || bucket.count === 0) return { day, totalSales: 0 };
      return { day, totalSales: Number((bucket.sum / bucket.count).toFixed(2)) };
    }),
    monthlyAverages: Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        month,
        totalSales: stats.count > 0 ? Number((stats.sum / stats.count).toFixed(2)) : 0
      }))
  };
};

export const fetchOverview = createAsyncThunk<
  { overview: PosOverviewResponse; chartRows: PosDailyRecord[] },
  FetchOverviewArgs | undefined,
  { state: RootState; rejectValue: string }
>('pos/fetchOverview', async (args, { getState, rejectWithValue }) => {
  try {
    const state = getState().pos;
    const start = args?.start ?? state.dateRange.from;
    const end = args?.end ?? state.dateRange.to;
    if (!isValidDateRange(start, end)) {
      return rejectWithValue('Select a valid date range before loading POS analytics.');
    }

    const [overviewRes, chartRowsRes] = await Promise.all([
      posApi.overview({ start, end }),
      posApi.daily(start, end)
    ]);

    return {
      overview: overviewRes.data.data,
      chartRows: parseRows(chartRowsRes.data)
    };
  } catch (error) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      'Failed to load POS overview';
    return rejectWithValue(message);
  }
});

export const fetchDaily = createAsyncThunk<
  PosDailyPagedResponse,
  FetchDailyArgs | undefined,
  { state: RootState; rejectValue: string }
>('pos/fetchDaily', async (args, { getState, rejectWithValue }) => {
  try {
    const state = getState().pos;
    const start = args?.start ?? state.dateRange.from;
    const end = args?.end ?? state.dateRange.to;
    const page = args?.page ?? state.page;
    const limit = args?.limit ?? state.limit;
    if (!isValidDateRange(start, end)) {
      return rejectWithValue('Select a valid date range before loading POS records.');
    }

    const response = await posApi.dailyPaged({ start, end, page, limit });
    return response.data.data;
  } catch (error) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      'Failed to load POS daily rows';
    return rejectWithValue(message);
  }
});

export const exportCsv = createAsyncThunk<void, ExportCsvArgs | undefined, { state: RootState; rejectValue: string }>(
  'pos/exportCsv',
  async (args, { getState, rejectWithValue }) => {
    try {
      const state = getState().pos;
      const start = args?.start ?? state.dateRange.from;
      const end = args?.end ?? state.dateRange.to;
      if (!isValidDateRange(start, end)) {
        return rejectWithValue('Select a valid date range before exporting CSV.');
      }
      const response = await posApi.exportCsv({ start, end });
      if (typeof window !== 'undefined') {
        const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
        const href = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = href;
        link.download = `pos-daily-${start}_to_${end}.csv`;
        link.click();
        URL.revokeObjectURL(href);
      }
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to export CSV';
      return rejectWithValue(message);
    }
  }
);

export const importCsv = createAsyncThunk<void, File, { dispatch: AppDispatch; rejectValue: string }>(
  'pos/importCsv',
  async (file, { dispatch, rejectWithValue }) => {
    try {
      await posApi.importCsv(file);
      dispatch(showSnackbar({ message: 'CSV imported successfully', severity: 'success' }));
      await dispatch(fetchDaily());
      await dispatch(fetchOverview());
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'CSV import failed';
      return rejectWithValue(message);
    }
  }
);

const parseRangeTab = (range?: string) => {
  if (!range) return 'Sheet1';
  const tab = String(range).split('!')[0]?.trim();
  return tab ? tab.replace(/^'/, '').replace(/'$/, '') : 'Sheet1';
};

export const syncGoogleSheet = createAsyncThunk<
  { imported: number; syncedAt: string },
  void,
  { dispatch: AppDispatch; rejectValue: string }
>('pos/syncGoogleSheet', async (_, { dispatch, rejectWithValue }) => {
  try {
    const settingsRes = await settingsApi.get();
    const gs = (settingsRes.data?.data?.googleSheets ?? {}) as Record<string, any>;
    let payload: { mapping: Record<string, string>; transforms?: Record<string, unknown>; options?: Record<string, unknown> } | null = null;

    if (gs.mode === 'oauth') {
      const source =
        gs.sources?.find((entry: any) => String(entry?.name ?? '').trim().toUpperCase() === 'POS DATA SHEET') ??
        gs.sources?.find((entry: any) => entry?.active) ??
        gs.sources?.[0];
      if (source?.spreadsheetId) {
        payload = {
          mapping: source.mapping ?? {},
          transforms: source.transformations ?? {},
          options: {
            mode: 'oauth',
            sourceId: source.sourceId,
            profileName: source.name,
            spreadsheetId: source.spreadsheetId,
            tab: parseRangeTab(source.range),
            headerRow: 1
          }
        };
      }
    } else {
      const sharedProfile =
        gs.sharedSheets?.find((sheet: any) => String(sheet?.name ?? '').trim().toUpperCase() === 'POS DATA SHEET') ??
        gs.sharedSheets?.find((sheet: any) => sheet?.isDefault) ??
        gs.sharedSheets?.[0];
      if (sharedProfile?.spreadsheetId) {
        payload = {
          mapping: sharedProfile.columnsMap ?? sharedProfile.lastMapping?.columnsMap ?? {},
          transforms: sharedProfile.lastMapping?.transformations ?? {},
          options: {
            mode: 'service_account',
            profileId: sharedProfile.profileId,
            profileName: sharedProfile.name,
            tab: sharedProfile.sheetName ?? 'Sheet1',
            headerRow: Number(sharedProfile.headerRow ?? 1)
          }
        };
      }
    }

    if (!payload || Object.keys(payload.mapping ?? {}).length === 0) {
      return rejectWithValue('No saved sheet mapping found. Configure mapping first.');
    }

    const response = await posApi.commitImport(payload);
    const imported = Number(response.data?.data?.result?.imported ?? 0);
    const syncedAt = new Date().toISOString();

    dispatch(showSnackbar({ message: 'Sheet sync completed', severity: 'success' }));
    await dispatch(fetchDaily());
    await dispatch(fetchOverview());

    return { imported, syncedAt };
  } catch (error) {
    const message =
      (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      'Sync from Google Sheet failed';
    return rejectWithValue(message);
  }
});

export const acknowledgeAlert = createAsyncThunk<string, string>('pos/acknowledgeAlert', async (alertId) => alertId);

type RestoreStatePayload = Partial<{
  view: PosView;
  iconOnly: boolean;
  dateRange: PosDateRange;
  page: number;
  limit: number;
}>;

export const posSlice = createSlice({
  name: 'pos',
  initialState,
  reducers: {
    setView(state, action: PayloadAction<PosView>) {
      state.view = action.payload;
      persistPosPreference(LOCAL_STORAGE_VIEW_KEY, action.payload);
    },
    setIconOnly(state, action: PayloadAction<boolean>) {
      state.iconOnly = action.payload;
      persistPosPreference(LOCAL_STORAGE_ICON_ONLY_KEY, String(action.payload));
    },
    setDateRange(state, action: PayloadAction<PosDateRange>) {
      state.dateRange = action.payload;
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    setLimit(state, action: PayloadAction<number>) {
      state.limit = action.payload;
      state.page = 1;
    },
    restoreState(state, action: PayloadAction<RestoreStatePayload>) {
      const next = action.payload;
      if (next.view) {
        state.view = next.view;
        persistPosPreference(LOCAL_STORAGE_VIEW_KEY, next.view);
      }
      if (typeof next.iconOnly === 'boolean') {
        state.iconOnly = next.iconOnly;
        persistPosPreference(LOCAL_STORAGE_ICON_ONLY_KEY, String(next.iconOnly));
      }
      if (next.dateRange) state.dateRange = next.dateRange;
      if (typeof next.page === 'number') state.page = next.page;
      if (typeof next.limit === 'number') state.limit = next.limit;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDaily.pending, (state) => {
        state.loading.daily = true;
        state.error = null;
      })
      .addCase(fetchDaily.fulfilled, (state, action) => {
        state.loading.daily = false;
        state.records = action.payload.data;
        state.totals = action.payload.totals;
        state.page = action.payload.page;
        state.limit = action.payload.limit;
        state.totalPages = action.payload.totalPages;
        state.totalCount = action.payload.totalCount;
      })
      .addCase(fetchDaily.rejected, (state, action) => {
        state.loading.daily = false;
        state.error = action.payload ?? action.error.message ?? 'Failed to load POS rows';
      })
      .addCase(fetchOverview.pending, (state) => {
        state.loading.overview = true;
        state.error = null;
      })
      .addCase(fetchOverview.fulfilled, (state, action) => {
        state.loading.overview = false;
        state.kpis = action.payload.overview.kpis;
        state.sparkline7 = action.payload.overview.sparkline7;
        state.alerts = action.payload.overview.alerts.map((alert) => ({ ...alert, acknowledged: false }));
        state.chartsData = buildChartsData(action.payload.chartRows);
      })
      .addCase(fetchOverview.rejected, (state, action) => {
        state.loading.overview = false;
        state.error = action.payload ?? action.error.message ?? 'Failed to load POS overview';
      })
      .addCase(importCsv.pending, (state) => {
        state.loading.importing = true;
        state.error = null;
      })
      .addCase(importCsv.fulfilled, (state) => {
        state.loading.importing = false;
      })
      .addCase(importCsv.rejected, (state, action) => {
        state.loading.importing = false;
        state.error = action.payload ?? action.error.message ?? 'CSV import failed';
      })
      .addCase(syncGoogleSheet.pending, (state) => {
        state.loading.syncing = true;
        state.error = null;
      })
      .addCase(syncGoogleSheet.fulfilled, (state, action) => {
        state.loading.syncing = false;
        state.lastSyncAt = action.payload.syncedAt;
      })
      .addCase(syncGoogleSheet.rejected, (state, action) => {
        state.loading.syncing = false;
        state.error = action.payload ?? action.error.message ?? 'Google sync failed';
      })
      .addCase(exportCsv.pending, (state) => {
        state.loading.exporting = true;
      })
      .addCase(exportCsv.fulfilled, (state) => {
        state.loading.exporting = false;
      })
      .addCase(exportCsv.rejected, (state, action) => {
        state.loading.exporting = false;
        state.error = action.payload ?? action.error.message ?? 'CSV export failed';
      })
      .addCase(acknowledgeAlert.fulfilled, (state, action) => {
        state.alerts = state.alerts.map((entry) =>
          entry.id === action.payload ? { ...entry, acknowledged: true } : entry
        );
      });
  }
});

export const { setView, setIconOnly, setDateRange, setPage, setLimit, restoreState } = posSlice.actions;

export const selectPosState = (state: RootState) => state.pos;

export default posSlice.reducer;
