import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  Grid2 as Grid,
  InputAdornment,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import type { QuickBooksTaxChartAccount, QuickBooksTaxReport, QuickBooksTaxReportKey } from '@retailsync/shared';
import { type ReactNode, useMemo, useState } from 'react';
import { RetailSurfaceCard, RetailSurfaceCardBody } from '../../../../components';
import {
  KpiCardModel,
  MoneyDisplay,
  basisLabel,
  filterAccounts,
  formatMoneyDisplay,
  formatReportDateRange,
  isTotalLikeRow,
  normalizeAccountType,
  summarizeAccountsByType
} from '../../utils/quickbooksReportsDisplay';

export const QuickBooksReportsFilterBar = ({
  from,
  to,
  basis,
  reportKey,
  reportOptions,
  loading,
  onFromChange,
  onToChange,
  onBasisChange,
  onReportKeyChange,
  onRunReport
}: {
  from: string;
  to: string;
  basis: 'cash' | 'accrual';
  reportKey: QuickBooksTaxReportKey;
  reportOptions: Array<{ value: QuickBooksTaxReportKey; label: string }>;
  loading: boolean;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onBasisChange: (value: 'cash' | 'accrual') => void;
  onReportKeyChange: (value: QuickBooksTaxReportKey) => void;
  onRunReport: () => void;
}) => (
  <RetailSurfaceCard>
    <RetailSurfaceCardBody>
      <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
        Report controls
      </Typography>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ md: 'flex-end' }}
        flexWrap="wrap"
        useFlexGap
      >
        <TextField
          size="small"
          type="date"
          label="From"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          size="small"
          select
          label="Basis"
          value={basis}
          onChange={(event) => onBasisChange(event.target.value as 'cash' | 'accrual')}
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
          onChange={(event) => onReportKeyChange(event.target.value as QuickBooksTaxReportKey)}
          sx={{ minWidth: 200 }}
        >
          {reportOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          onClick={onRunReport}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : undefined}
        >
          Run report
        </Button>
      </Stack>
    </RetailSurfaceCardBody>
  </RetailSurfaceCard>
);

const KpiValue = ({ money }: { money: MoneyDisplay }) => (
  <Typography
    variant="h6"
    sx={{
      color: money.isMissing ? 'text.secondary' : money.isNegative ? 'warning.dark' : 'text.primary',
      fontWeight: 700
    }}
  >
    {money.text}
  </Typography>
);

export const QuickBooksExecutiveSummary = ({
  loading,
  error,
  kpis
}: {
  loading: boolean;
  error: string | null;
  kpis: KpiCardModel[];
}) => (
  <RetailSurfaceCard>
    <RetailSurfaceCardBody>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
        Executive summary
      </Typography>
      {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
      <Grid container spacing={1.5}>
        {kpis.map((kpi) => (
          <Grid key={kpi.label} size={{ xs: 12, sm: 6, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, height: '100%' }}>
              <Typography variant="caption" color="text.secondary">
                {kpi.label}
              </Typography>
              {loading ? (
                <Typography variant="body2" sx={{ mt: 0.5 }}>
                  Loading…
                </Typography>
              ) : (
                <>
                  <KpiValue money={kpi.money} />
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {kpi.helper}
                  </Typography>
                </>
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>
    </RetailSurfaceCardBody>
  </RetailSurfaceCard>
);

export const QuickBooksReportViewer = ({
  reportLabel,
  from,
  to,
  basis,
  loading,
  error,
  report
}: {
  reportLabel: string;
  from: string;
  to: string;
  basis: 'cash' | 'accrual';
  loading: boolean;
  error: string | null;
  report: QuickBooksTaxReport | null;
}) => {
  const rows = report?.rows ?? [];

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h6" fontWeight={700}>
          {reportLabel}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {formatReportDateRange(from, to)} · {basisLabel(basis)}
        </Typography>
      </Box>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, maxHeight: 480 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Account / section</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography color="text.secondary">Loading report…</Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              rows.map((row, index) => {
                const depth = Array.isArray(row.path) ? row.path.length : 0;
                const money = formatMoneyDisplay(row.amount);
                const totalRow = isTotalLikeRow(row.label);
                return (
                  <TableRow key={`${row.label}-${index}`}>
                    <TableCell sx={{ pl: 2 + depth * 2 }}>
                      <Typography fontWeight={totalRow ? 700 : 400}>{row.label}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        fontWeight={totalRow ? 700 : 400}
                        color={money.isMissing ? 'text.secondary' : money.isNegative ? 'warning.dark' : 'text.primary'}
                      >
                        {money.text}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2}>
                  <Typography color="text.secondary">No report rows returned.</Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
};

export const QuickBooksChartOfAccountsPanel = ({
  accounts,
  loading,
  error
}: {
  accounts: QuickBooksTaxChartAccount[];
  loading: boolean;
  error: string | null;
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const typeOptions = useMemo(() => {
    const buckets = summarizeAccountsByType(accounts).map(([type]) => type);
    return ['all', ...buckets];
  }, [accounts]);

  const filtered = useMemo(
    () => filterAccounts(accounts, search, typeFilter),
    [accounts, search, typeFilter]
  );

  const paged = useMemo(() => {
    const start = page * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, page, rowsPerPage]);

  const typeSummary = useMemo(() => summarizeAccountsByType(accounts), [accounts]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
        <TextField
          size="small"
          placeholder="Search accounts"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
          sx={{ flex: 1, minWidth: 220 }}
        />
        <TextField
          size="small"
          select
          label="Type"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value);
            setPage(0);
          }}
          sx={{ minWidth: 160 }}
        >
          {typeOptions.map((type) => (
            <MenuItem key={type} value={type}>
              {type === 'all' ? 'All types' : type}
            </MenuItem>
          ))}
        </TextField>
        <Chip label={`${accounts.length} accounts`} variant="outlined" />
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {typeSummary.map(([type, count]) => (
          <Chip key={type} size="small" label={`${type}: ${count}`} variant="outlined" />
        ))}
      </Stack>

      {error ? <Alert severity="error">{error}</Alert> : null}

      <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Account name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Code</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary">Loading accounts…</Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {!loading &&
              paged.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>
                    <Chip size="small" label={normalizeAccountType(account.accountType)} variant="outlined" />
                  </TableCell>
                  <TableCell>{account.code?.trim() ? account.code : '—'}</TableCell>
                </TableRow>
              ))}
            {!loading && paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography color="text.secondary">No accounts match your filters.</Typography>
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <TablePagination
        component="div"
        count={filtered.length}
        page={page}
        onPageChange={(_event, nextPage) => setPage(nextPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number.parseInt(event.target.value, 10));
          setPage(0);
        }}
        rowsPerPageOptions={[10, 15, 25, 50]}
      />
    </Stack>
  );
};

export const QuickBooksReportsTabs = ({
  reportPanel,
  accountsPanel,
  onAccountsTabOpen
}: {
  reportPanel: ReactNode;
  accountsPanel: ReactNode;
  onAccountsTabOpen?: () => void;
}) => {
  const [tab, setTab] = useState(0);

  return (
    <RetailSurfaceCard data-testid="qb-reports-tabs">
      <RetailSurfaceCardBody>
        <Tabs
          value={tab}
          onChange={(_event, value) => {
            setTab(value);
            if (value === 1) onAccountsTabOpen?.();
          }}
          sx={{ mb: 2 }}
        >
          <Tab label="Report viewer" data-testid="qb-reports-tab-viewer" />
          <Tab label="Chart of accounts" data-testid="qb-reports-tab-accounts" />
        </Tabs>
        <Box data-testid={tab === 0 ? 'qb-report-viewer-panel' : 'qb-chart-of-accounts-panel'}>
          {tab === 0 ? reportPanel : accountsPanel}
        </Box>
      </RetailSurfaceCardBody>
    </RetailSurfaceCard>
  );
};
