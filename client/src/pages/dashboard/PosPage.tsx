import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  TableContainer,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SyncIcon from '@mui/icons-material/Sync';
import TableRowsIcon from '@mui/icons-material/TableRows';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import TodayIcon from '@mui/icons-material/Today';
import GoogleIcon from '@mui/icons-material/Google';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { useCallback, useEffect, useRef, useState } from 'react';
import { posApi, settingsApi } from '../../api';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import { PermissionGate } from '../../app/guards';
import {
  DateRangeControlPanel,
  ImportPOSDataModal,
  LoadingEmptyStateWrapper,
  NoAccess,
  PageHeader,
  firstOfMonthISO,
  todayISO
} from '../../components';
import { hasPermission } from '../../utils/permissions';
import { useTablePagination } from '../../hooks/useTablePagination';
import { formatDate } from '../../utils/date';
import { TABLE_PAGE_SIZE_OPTIONS } from '../../constants/pagination';
import { showSnackbar } from '../../slices/ui/uiSlice';

type PosRow = {
  _id: string;
  date: string;
  day: string;
  highTax: number;
  lowTax: number;
  saleTax: number;
  totalSales: number;
  gas: number;
  lottery: number;
  creditCard: number;
  cash: number;
  cashExpenses: number;
  notes: string;
};

type LastImportSource = 'file' | 'google_sheets' | null;

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const PosPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'pos', 'view');
  const canImport = hasPermission(permissions, 'pos', 'create') && hasPermission(permissions, 'pos', 'actions:import');

  const [rows, setRows] = useState<PosRow[]>([]);
  const [openImportModal, setOpenImportModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [fromDate, setFromDate] = useState(firstOfMonthISO);
  const [toDate, setToDate] = useState(todayISO);
  const [error, setError] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [sheetsConfigured, setSheetsConfigured] = useState(false);
  const [lastImportSource, setLastImportSource] = useState<LastImportSource>(null);
  const autoSyncDone = useRef(false);

  const {
    page, rowsPerPage, rowCount, pagedRows,
    onChangePage, onChangeRowsPerPage
  } = useTablePagination({ rows, initialRowsPerPage: 15 });

  const loadDaily = useCallback(async () => {
    if (!fromDate || !toDate || fromDate > toDate) return;
    setLoading(true);
    setError(null);
    try {
      const res = await posApi.daily(fromDate, toDate);
      setRows(res.data.data);
    } catch {
      setError('Failed to load POS daily data.');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const refreshSettings = async () => {
    try {
      const res = await settingsApi.get();
      const data = res.data?.data;
      const gs = data?.googleSheets;
      setSheetsConfigured(!!gs?.sharedConfig?.spreadsheetId && gs?.sharedConfig?.enabled);
      setLastImportSource(data?.lastImportSource ?? null);
    } catch { /* best-effort */ }
  };

  const syncFromSheets = async () => {
    try {
      setSyncing(true);
      setError(null);
      await posApi.commitImport({ mapping: {}, transforms: {}, options: {} });
      setLastSynced(new Date().toLocaleTimeString());
      setLastImportSource('google_sheets');
      dispatch(showSnackbar({ message: 'Synced latest data from Google Sheets', severity: 'success' }));
      await loadDaily();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      if (msg?.includes('No spreadsheet configured') || msg?.includes('disabled')) {
        setError('Google Sheets not configured. Set up your spreadsheet in Settings first.');
      } else {
        setError(msg ?? 'Sync from Sheets failed.');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleImported = async () => {
    await refreshSettings();
    await loadDaily();
  };

  useEffect(() => {
    if (!canView) return;

    const init = async () => {
      await refreshSettings();
      await loadDaily();

      if (sheetsConfigured && canImport && !autoSyncDone.current) {
        autoSyncDone.current = true;
        try {
          await posApi.commitImport({ mapping: {}, transforms: {}, options: {} });
          setLastSynced(new Date().toLocaleTimeString());
          setLastImportSource('google_sheets');
          await loadDaily();
        } catch { /* auto-sync is best-effort */ }
      }
    };

    void init();
  }, [canView]);

  useEffect(() => {
    if (canView && autoSyncDone.current) void loadDaily();
  }, [fromDate, toDate]);

  if (!canView) return <NoAccess />;

  const totalSales = rows.reduce((s, r) => s + r.totalSales, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditCard, 0);
  const totalCash = rows.reduce((s, r) => s + r.cash, 0);

  const sourceChip = lastImportSource === 'google_sheets'
    ? <Chip icon={<GoogleIcon />} label="Google Sheets" size="small" color="success" variant="outlined" />
    : lastImportSource === 'file'
    ? <Chip icon={<InsertDriveFileIcon />} label="File Import" size="small" color="info" variant="outlined" />
    : null;

  return (
    <Stack spacing={2}>
      <PageHeader
        title="POS Daily Sales"
        subtitle="Import, sync, and review daily point-of-sale summaries"
        icon={<PointOfSaleIcon />}
      />

      <DateRangeControlPanel
        from={fromDate}
        to={toDate}
        onFromChange={setFromDate}
        onToChange={setToDate}
        loading={loading}
        onRefresh={() => void loadDaily()}
        actions={
          <>
            {lastImportSource === 'google_sheets' && sheetsConfigured && (
              <PermissionGate module="pos" action="actions:import" mode="disable">
                <Tooltip title="Pull latest data from your connected Google Sheet">
                  <span>
                    <Button
                      variant="outlined"
                      size="small"
                      color="success"
                      startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                      onClick={() => void syncFromSheets()}
                      disabled={syncing || loading || !canImport}
                    >
                      Sync from Sheets
                    </Button>
                  </span>
                </Tooltip>
              </PermissionGate>
            )}
            <PermissionGate module="pos" action="actions:import" mode="disable">
              <Button
                variant="contained"
                size="small"
                startIcon={<UploadFileIcon />}
                onClick={() => setOpenImportModal(true)}
                disabled={!canImport || loading}
              >
                Import Data
              </Button>
            </PermissionGate>
          </>
        }
        stats={
          rows.length > 0 ? (
            <>
              <Chip icon={<TodayIcon />} label={`${rows.length} day${rows.length !== 1 ? 's' : ''}`} size="small" variant="outlined" />
              <Chip label={`Sales: $${fmt(totalSales)}`} size="small" color="primary" variant="outlined" />
              {sourceChip}
              {lastSynced && (
                <Typography variant="caption" color="text.secondary">Synced: {lastSynced}</Typography>
              )}
            </>
          ) : undefined
        }
      />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && rows.length === 0}
        loadingLabel="Loading POS data..."
        emptyMessage="No POS data for this date range"
        emptySecondary="Import data from a file, sync from Google Sheets, or select a different range."
        emptyActionLabel="Import Data"
        onEmptyAction={() => setOpenImportModal(true)}
      >
        <Paper sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TableRowsIcon fontSize="small" color="primary" />
              Daily POS Summary
            </Typography>
            <Stack direction="row" spacing={1}>
              <Chip label={`Credit: $${fmt(totalCredit)}`} size="small" color="info" variant="outlined" />
              <Chip label={`Cash: $${fmt(totalCash)}`} size="small" color="success" variant="outlined" />
            </Stack>
          </Stack>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Day</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">High Tax</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Low Tax</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Sale Tax</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Total Sales</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Credit Card</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Cash</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Gas</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Lottery</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Cash Exp.</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRows.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>{formatDate(row.date, 'short')}</TableCell>
                    <TableCell>{row.day}</TableCell>
                    <TableCell align="right">{fmt(row.highTax)}</TableCell>
                    <TableCell align="right">{fmt(row.lowTax)}</TableCell>
                    <TableCell align="right">{fmt(row.saleTax)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(row.totalSales)}</TableCell>
                    <TableCell align="right">{fmt(row.creditCard)}</TableCell>
                    <TableCell align="right">{fmt(row.cash)}</TableCell>
                    <TableCell align="right">{fmt(row.gas)}</TableCell>
                    <TableCell align="right">{fmt(row.lottery)}</TableCell>
                    <TableCell align="right">{fmt(row.cashExpenses)}</TableCell>
                  </TableRow>
                ))}
                {pagedRows.length > 0 && (
                  <TableRow sx={{ bgcolor: 'action.selected' }}>
                    <TableCell sx={{ fontWeight: 700 }} colSpan={2}>Total ({rows.length} days)</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(rows.reduce((s, r) => s + r.highTax, 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(rows.reduce((s, r) => s + r.lowTax, 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(rows.reduce((s, r) => s + r.saleTax, 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totalSales)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totalCredit)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totalCash)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(rows.reduce((s, r) => s + r.gas, 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(rows.reduce((s, r) => s + r.lottery, 0))}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(rows.reduce((s, r) => s + r.cashExpenses, 0))}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={rowCount}
            page={page}
            onPageChange={onChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => onChangeRowsPerPage(Number(e.target.value))}
            rowsPerPageOptions={[...TABLE_PAGE_SIZE_OPTIONS]}
          />
        </Paper>
      </LoadingEmptyStateWrapper>

      <ImportPOSDataModal
        open={openImportModal}
        onClose={() => setOpenImportModal(false)}
        onImported={() => handleImported()}
      />
    </Stack>
  );
};
