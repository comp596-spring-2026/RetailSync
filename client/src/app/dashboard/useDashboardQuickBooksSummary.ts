import { useCallback, useEffect, useMemo, useState } from 'react';
import type { QuickBooksTaxOverview } from '@retailsync/shared';
import { accountingApi } from '../../modules/accounting/api';
import { useQuickBooksWorkspace } from '../../modules/quickbooks/hooks/useQuickBooksWorkspace';
import { extractApiErrorMessage } from '../../utils/apiError';
import { currentYearRange } from './dateRange';

export type DashboardQuickBooksSummary = {
  range: { start: string; end: string };
  overview: QuickBooksTaxOverview;
  companyName: string | null;
  connectionLabel: string;
  lastRefreshLabel: string | null;
};

export type DashboardQuickBooksSummaryState =
  | { status: 'idle' }
  | { status: 'no_access' }
  | { status: 'loading' }
  | { status: 'not_connected' }
  | { status: 'ready'; data: DashboardQuickBooksSummary }
  | { status: 'error'; message: string };

export const useDashboardQuickBooksSummary = (enabled: boolean) => {
  const workspace = useQuickBooksWorkspace(enabled);
  const [reportState, setReportState] = useState<DashboardQuickBooksSummaryState>({ status: 'idle' });

  const loadReports = useCallback(async () => {
    if (!enabled) {
      setReportState({ status: 'no_access' });
      return;
    }
    if (workspace.loading) {
      setReportState({ status: 'loading' });
      return;
    }
    if (!workspace.isConnected) {
      setReportState({ status: 'not_connected' });
      return;
    }

    const range = currentYearRange();
    setReportState({ status: 'loading' });
    try {
      const response = await accountingApi.getQuickbooksTaxOverview({
        from: range.start,
        to: range.end,
        basis: 'accrual'
      });
      const overview = response.data.data;
      const refreshedAt = workspace.health?.refreshedAt ?? workspace.health?.checkedAt ?? null;
      setReportState({
        status: 'ready',
        data: {
          range,
          overview,
          companyName: workspace.oauthStatus?.companyName ?? null,
          connectionLabel: workspace.needsReconnect
            ? 'Needs reconnect'
            : workspace.isDegraded
              ? 'Degraded'
              : 'Connected',
          lastRefreshLabel: refreshedAt ? new Date(refreshedAt).toLocaleString() : null
        }
      });
    } catch (error) {
      setReportState({
        status: 'error',
        message: extractApiErrorMessage(error, 'Failed to load QuickBooks summary')
      });
    }
  }, [
    enabled,
    workspace.health?.checkedAt,
    workspace.health?.refreshedAt,
    workspace.isConnected,
    workspace.isDegraded,
    workspace.loading,
    workspace.needsReconnect,
    workspace.oauthStatus?.companyName
  ]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const combinedLoading = enabled && (workspace.loading || reportState.status === 'loading');

  const status = useMemo(() => {
    if (!enabled) return 'no_access' as const;
    if (workspace.loading || reportState.status === 'loading') return 'loading' as const;
    if (!workspace.isConnected) return 'not_connected' as const;
    return reportState.status;
  }, [enabled, reportState.status, workspace.isConnected, workspace.loading]);

  return {
    workspace,
    reportState,
    status,
    combinedLoading,
    reload: loadReports
  };
};
