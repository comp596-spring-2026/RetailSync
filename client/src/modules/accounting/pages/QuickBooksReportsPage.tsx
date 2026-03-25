import {
  Alert,
  Button,
  Chip,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import InsightsIcon from '@mui/icons-material/Insights';
import { QuickBooksTaxReportKey } from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoAccess, PageHeader } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

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

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '-' : currencyFormatter.format(value);

type SectionState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

export const QuickBooksReportsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } = useQuickBooksWorkspace(canView);

  const dateWindow = useMemo(defaultWindow, []);
  const [from, setFrom] = useState(dateWindow.from);
  const [to, setTo] = useState(dateWindow.to);
  const [basis, setBasis] = useState<'cash' | 'accrual'>('accrual');
  const [reportKey, setReportKey] = useState<QuickBooksTaxReportKey>('profit-loss');

  const [overview, setOverview] = useState<SectionState<any>>({ loading: false, error: null, data: null });
  const [report, setReport] = useState<SectionState<any>>({ loading: false, error: null, data: null });
  const [accounts, setAccounts] = useState<SectionState<any[]>>({ loading: false, error: null, data: null });
  const [ledger, setLedger] = useState<SectionState<any>>({ loading: false, error: null, data: null });

  const baseParams = useMemo(() => ({ from, to, basis }), [from, to, basis]);

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

  const refreshAll = useCallback(async () => {
    await Promise.all([loadOverview(), loadReport(), loadAccounts(), loadLedger()]);
  }, [loadAccounts, loadLedger, loadOverview, loadReport]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void refreshAll();
  }, [canView, isConnected, refreshAll]);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Reports"
        subtitle="Review Balance Sheet, Profit & Loss, and supporting live QuickBooks reports."
        icon={<InsightsIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField
              size="small"
              type="date"
              label="From"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              select
              label="Basis"
              value={basis}
              onChange={(event) => setBasis(event.target.value as 'cash' | 'accrual')}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="accrual">Accrual</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
            </TextField>
            <TextField
              size="small"
              select
              label="Report"
              value={reportKey}
              onChange={(event) => setReportKey(event.target.value as QuickBooksTaxReportKey)}
              sx={{ minWidth: 180 }}
            >
              {reportOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={() => void refreshAll()}>
              Refresh Reports
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Summary
          </Typography>
          {overview.error ? <Alert severity="error">{overview.error}</Alert> : null}
          <Grid container spacing={1}>
            {[
              { label: 'Net Income', value: overview.data?.cards?.netIncome },
              { label: 'Total Assets', value: overview.data?.cards?.totalAssets },
              { label: 'Total Liabilities', value: overview.data?.cards?.totalLiabilities },
              { label: 'Total Equity', value: overview.data?.cards?.totalEquity },
              { label: 'AR Open', value: overview.data?.cards?.arOpen },
              { label: 'AP Open', value: overview.data?.cards?.apOpen }
            ].map((card) => (
              <Grid key={card.label} item xs={12} sm={6} md={4}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {card.label}
                  </Typography>
                  <Typography variant="h6">
                    {overview.loading ? 'Loading...' : formatCurrency(card.value)}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Report Viewer
          </Typography>
          {report.error ? <Alert severity="error">{report.error}</Alert> : null}
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Chip size="small" label={reportOptions.find((item) => item.value === reportKey)?.label ?? reportKey} />
            <Chip size="small" label={`Rows ${report.data?.rows?.length ?? 0}`} />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Label</TableCell>
                <TableCell>Path</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(report.data?.rows ?? []).slice(0, 200).map((row: any, index: number) => (
                <TableRow key={`${row.label}-${index}`}>
                  <TableCell>{row.label}</TableCell>
                  <TableCell>{Array.isArray(row.path) ? row.path.join(' > ') : ''}</TableCell>
                  <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                </TableRow>
              ))}
              {!report.loading && (report.data?.rows?.length ?? 0) === 0 ? (
                <TableRow>
                  <TableCell colSpan={3}>
                    <Typography color="text.secondary">No report rows.</Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Paper>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Chart of Accounts
              </Typography>
              {accounts.error ? <Alert severity="error">{accounts.error}</Alert> : null}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(accounts.data ?? []).slice(0, 200).map((account: any) => (
                    <TableRow key={account.id}>
                      <TableCell>{account.code ?? '-'}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>{account.accountType ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                General Ledger
              </Typography>
              {ledger.error ? <Alert severity="error">{ledger.error}</Alert> : null}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(ledger.data?.entries ?? []).slice(0, 200).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.txnDate ?? '-'}</TableCell>
                      <TableCell>{row.description}</TableCell>
                      <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        </Grid>
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksReportsPage;
