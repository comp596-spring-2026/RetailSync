import { useCallback, useEffect, useMemo, useState } from 'react';
import { posApi, type PosDailyRecord, type PosOverviewResponse, type PosTrendDailyPoint } from '../../modules/pos/api';
import type { IntegrationSettings } from '../../modules/settings/state/settingsSlice';
import type { GoogleSheetsCanonicalSettings } from '../../modules/settings/types/googleSheets';
import { extractApiErrorMessage } from '../../utils/apiError';
import { lastNDaysRange } from './dateRange';
import { resolvePosSheetsConfigured, resolvePosSheetsConnected } from './posConnection';

export type DashboardPosSummary = {
  range: { start: string; end: string };
  overview: PosOverviewResponse;
  totals: {
    highTax: number;
    lowTax: number;
    saleTax: number;
    totalSales: number;
    gas: number;
    lottery: number;
  };
  chartSeries: Array<{ x: string; y: number }>;
  lastUpdatedLabel: string | null;
};

export type DashboardPosSummaryState =
  | { status: 'idle' }
  | { status: 'no_access' }
  | { status: 'loading' }
  | { status: 'not_configured'; sheetsConnected: boolean }
  | { status: 'configured_no_data' }
  | { status: 'ready'; data: DashboardPosSummary }
  | { status: 'error'; message: string };

const parseRows = (payload: unknown): PosDailyRecord[] => {
  if (!payload || typeof payload !== 'object') return [];
  const asResponse = payload as { data?: unknown };
  if (Array.isArray(asResponse.data)) return asResponse.data as PosDailyRecord[];
  if (Array.isArray(payload)) return payload as PosDailyRecord[];
  return [];
};

const parseDailyTrendRows = (payload: unknown): PosTrendDailyPoint[] => {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as { data?: { data?: unknown } })?.data?.data;
  if (!Array.isArray(rows)) return [];
  return rows.filter((entry): entry is PosTrendDailyPoint => {
    if (!entry || typeof entry !== 'object') return false;
    const row = entry as Partial<PosTrendDailyPoint>;
    return typeof row.x === 'string' && typeof row.totalSales === 'number';
  });
};

const sumTotals = (rows: PosDailyRecord[]) =>
  rows.reduce(
    (acc, row) => ({
      highTax: acc.highTax + Number(row.highTax ?? 0),
      lowTax: acc.lowTax + Number(row.lowTax ?? 0),
      saleTax: acc.saleTax + Number(row.saleTax ?? 0),
      totalSales: acc.totalSales + Number(row.totalSales ?? 0),
      gas: acc.gas + Number(row.gas ?? 0),
      lottery: acc.lottery + Number(row.lottery ?? 0)
    }),
    { highTax: 0, lowTax: 0, saleTax: 0, totalSales: 0, gas: 0, lottery: 0 }
  );

export const useDashboardPosSummary = ({
  enabled,
  settings,
  googleSheetsCanonical,
  settingsReady
}: {
  enabled: boolean;
  settings: IntegrationSettings | null;
  googleSheetsCanonical: GoogleSheetsCanonicalSettings | null | undefined;
  settingsReady: boolean;
}) => {
  const [state, setState] = useState<DashboardPosSummaryState>({ status: 'idle' });

  const sheetsConfigured = useMemo(
    () => resolvePosSheetsConfigured(settings, googleSheetsCanonical),
    [googleSheetsCanonical, settings]
  );
  const sheetsConnected = useMemo(
    () => resolvePosSheetsConnected(settings, googleSheetsCanonical),
    [googleSheetsCanonical, settings]
  );

  const load = useCallback(async () => {
    if (!enabled) {
      setState({ status: 'no_access' });
      return;
    }
    if (!settingsReady) {
      setState({ status: 'loading' });
      return;
    }
    if (!sheetsConfigured) {
      setState({ status: 'not_configured', sheetsConnected });
      return;
    }

    const range = lastNDaysRange(30);
    setState({ status: 'loading' });
    try {
      const [overviewRes, dailyRes, trendRes] = await Promise.all([
        posApi.overview({ start: range.start, end: range.end }),
        posApi.daily(range.start, range.end),
        posApi.trend({ start: range.start, end: range.end, granularity: 'daily' })
      ]);

      const overview = overviewRes.data.data;
      const rows = parseRows(dailyRes.data);
      const trend = parseDailyTrendRows(trendRes.data);
      const totals = sumTotals(rows);

      if (rows.length === 0 && overview.kpis.totalSales <= 0) {
        setState({ status: 'configured_no_data' });
        return;
      }

      const chartSeries = [...trend]
        .filter((point) => Boolean(point.x))
        .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime())
        .map((point) => ({ x: point.x, y: point.totalSales }));

      const lastUpdatedLabel = settings?.lastImportAt
        ? new Date(settings.lastImportAt).toLocaleString()
        : null;

      setState({
        status: 'ready',
        data: {
          range,
          overview,
          totals,
          chartSeries,
          lastUpdatedLabel
        }
      });
    } catch (error) {
      setState({
        status: 'error',
        message: extractApiErrorMessage(error, 'Failed to load POS summary')
      });
    }
  }, [enabled, settings?.lastImportAt, settingsReady, sheetsConfigured, sheetsConnected]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    state,
    sheetsConfigured,
    sheetsConnected,
    reload: load
  };
};
