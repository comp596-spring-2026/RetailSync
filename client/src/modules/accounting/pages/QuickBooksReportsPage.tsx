import InsightsIcon from '@mui/icons-material/Insights';
import {
  Alert,
  Chip,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import type { QuickBooksTaxChartAccount, QuickBooksTaxLedgerResponse, QuickBooksTaxOverview, QuickBooksTaxReport } from '@retailsync/shared';
import { QuickBooksTaxReportKey } from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoAccess, PageHeader, RetailSurfaceCard, RetailSurfaceCardBody } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import {
  QuickBooksChartOfAccountsPanel,
  QuickBooksExecutiveSummary,
  QuickBooksReportViewer,
  QuickBooksReportsFilterBar,
  QuickBooksReportsTabs
} from '../components/quickbooksReports/QuickBooksReportsSections';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import { buildExecutiveKpis, formatMoneyDisplay } from '../utils/quickbooksReportsDisplay';

const reportOptions: Array<{ value: QuickBooksTaxReportKey; label: string }> = [
  { value: 'profit-loss', label: 'Profit & Loss' },
  { value: 'balance-sheet', label: 'Balance Sheet' },
  { value: 'trial-balance', label: 'Trial Balance' },
  { value: 'general-ledger', label: 'General Ledger' },
  { value: 'ar-aging', label: 'AR Aging' },
  { value: 'ap-aging', label: 'AP Aging' }
];

const defaultWindow = () => {
  const now = new Date();
  return {
    from: `${now.getUTCFullYear()}-01-01`,
    to: now.toISOString().slice(0, 10)
  };
};

type SectionState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

export const QuickBooksReportsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const {
    loading: workspaceLoading,
    isConnected,
    error: workspaceError,
    warning: workspaceWarning,
    settings,
    oauthStatus,
    connectionStatus
  } = useQuickBooksWorkspace(canView);

  const dateWindow = useMemo(defaultWindow, []);
  const [from, setFrom] = useState(dateWindow.from);
  const [to, setTo] = useState(dateWindow.to);
  const [basis, setBasis] = useState<'cash' | 'accrual'>('accrual');
  const [reportKey, setReportKey] = useState<QuickBooksTaxReportKey>('profit-loss');
  const [running, setRunning] = useState(false);

  const [overview, setOverview] = useState<SectionState<QuickBooksTaxOverview>>({
    loading: false,
    error: null,
    data: null
  });
  const [report, setReport] = useState<SectionState<QuickBooksTaxReport>>({
    loading: false,
    error: null,
    data: null
  });
  const [accounts, setAccounts] = useState<SectionState<QuickBooksTaxChartAccount[]>>({
    loading: false,
    error: null,
    data: null
  });
  const [ledger, setLedger] = useState<SectionState<QuickBooksTaxLedgerResponse>>({
    loading: false,
    error: null,
    data: null
  });
  const [accountsTabOpened, setAccountsTabOpened] = useState(false);

  const baseParams = useMemo(() => ({ from, to, basis }), [from, to, basis]);
  const reportLabel = reportOptions.find((item) => item.value === reportKey)?.label ?? reportKey;

  const loadOverview = useCallback(async () => {
    setOverview((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await accountingApi.getQuickbooksTaxOverview(baseParams);
      setOverview({ loading: false, error: null, data: response.data.data });
    } catch (apiError) {
      setOverview({
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load QuickBooks overview'),
        data: null
      });
    }
  }, [baseParams]);

  const loadReport = useCallback(async () => {
    setReport((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await accountingApi.getQuickbooksTaxReport(reportKey, baseParams);
      setReport({ loading: false, error: null, data: response.data.data });
    } catch (apiError) {
      setReport({
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load QuickBooks report'),
        data: null
      });
    }
  }, [baseParams, reportKey]);

  const loadAccounts = useCallback(async () => {
    setAccounts((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await accountingApi.getQuickbooksTaxChartOfAccounts();
      setAccounts({ loading: false, error: null, data: response.data.data });
    } catch (apiError) {
      setAccounts({
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load chart of accounts'),
        data: null
      });
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setLedger((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await accountingApi.getQuickbooksTaxLedger({
        ...baseParams,
        limit: 100
      });
      setLedger({ loading: false, error: null, data: response.data.data });
    } catch (apiError) {
      setLedger({
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load QuickBooks general ledger'),
        data: null
      });
    }
  }, [baseParams]);

  const runReports = useCallback(async () => {
    setRunning(true);
    try {
      await Promise.all([
        loadOverview(),
        loadReport(),
        reportKey === 'general-ledger' ? loadLedger() : Promise.resolve()
      ]);
    } finally {
      setRunning(false);
    }
  }, [loadLedger, loadOverview, loadReport, reportKey]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void runReports();
  }, [canView, isConnected]);

  useEffect(() => {
    if (!canView || !isConnected || !accountsTabOpened || accounts.data) return;
    void loadAccounts();
  }, [accounts.data, accountsTabOpened, canView, isConnected, loadAccounts]);

  const kpis = useMemo(() => buildExecutiveKpis(overview.data), [overview.data]);

  const lastSyncedLabel = useMemo(() => {
    const refreshedAt = oauthStatus?.health?.refreshedAt ?? settings?.lastPullAt ?? null;
    return refreshedAt ? new Date(refreshedAt).toLocaleString() : null;
  }, [oauthStatus?.health?.refreshedAt, settings?.lastPullAt]);

  const connectionChipLabel =
    connectionStatus === 'connected'
      ? 'Connected'
      : connectionStatus === 'degraded'
        ? 'Needs attention'
        : 'Not connected';

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Reports"
        subtitle="Review Balance Sheet, Profit & Loss, and live accounting reports."
        icon={<InsightsIcon />}
      />
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <Chip
          size="small"
          label={connectionChipLabel}
          color={connectionStatus === 'connected' ? 'success' : 'warning'}
          variant="outlined"
        />
        {oauthStatus?.companyName ? (
          <Chip size="small" label={oauthStatus.companyName} variant="outlined" />
        ) : null}
        {lastSyncedLabel ? (
          <Typography variant="caption" color="text.secondary">
            Last synced: {lastSyncedLabel}
          </Typography>
        ) : null}
      </Stack>

      <QuickBooksTabs />

      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Stack spacing={2}>
          <QuickBooksReportsFilterBar
            from={from}
            to={to}
            basis={basis}
            reportKey={reportKey}
            reportOptions={reportOptions}
            loading={running || overview.loading || report.loading}
            onFromChange={setFrom}
            onToChange={setTo}
            onBasisChange={setBasis}
            onReportKeyChange={setReportKey}
            onRunReport={() => void runReports()}
          />

          <QuickBooksExecutiveSummary loading={overview.loading} error={overview.error} kpis={kpis} />

          <QuickBooksReportsTabs
            onAccountsTabOpen={() => setAccountsTabOpened(true)}
            reportPanel={
              <Stack spacing={2}>
                <QuickBooksReportViewer
                  reportLabel={reportLabel}
                  from={from}
                  to={to}
                  basis={basis}
                  loading={report.loading}
                  error={report.error}
                  report={report.data}
                />
                {reportKey === 'general-ledger' ? (
                  <RetailSurfaceCard>
                    <RetailSurfaceCardBody>
                      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                        General ledger entries
                      </Typography>
                      {ledger.error ? <Alert severity="error">{ledger.error}</Alert> : null}
                      <TableContainer sx={{ maxHeight: 360 }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow>
                              <TableCell>Date</TableCell>
                              <TableCell>Description</TableCell>
                              <TableCell align="right">Amount</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {ledger.loading ? (
                              <TableRow>
                                <TableCell colSpan={3}>
                                  <CircularProgress size={18} />
                                </TableCell>
                              </TableRow>
                            ) : null}
                            {!ledger.loading &&
                              (ledger.data?.entries ?? []).map((row) => {
                                const money = formatMoneyDisplay(row.amount);
                                return (
                                  <TableRow key={row.id}>
                                    <TableCell>{row.txnDate ?? '—'}</TableCell>
                                    <TableCell>{row.description}</TableCell>
                                    <TableCell align="right">{money.text}</TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </RetailSurfaceCardBody>
                  </RetailSurfaceCard>
                ) : null}
              </Stack>
            }
            accountsPanel={
              <QuickBooksChartOfAccountsPanel
                accounts={accounts.data ?? []}
                loading={accounts.loading}
                error={accounts.error}
              />
            }
          />
        </Stack>
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksReportsPage;
