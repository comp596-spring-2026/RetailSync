import SyncAltIcon from '@mui/icons-material/SyncAlt';
import { Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoAccess, PageHeader, SmartTable } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import {
  quickBooksHubSortToParam,
  type QuickBooksHubOperationsParams,
  type QuickBooksHubOperationRow,
  type QuickBooksHubSortModel
} from '../types/quickbooksHub';

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Not Posted', value: 'not_posted' },
  { label: 'Posting', value: 'posting' },
  { label: 'Posted', value: 'posted' },
  { label: 'Failed', value: 'failed' }
] as const;

const typeOptions = [
  { label: 'All', value: 'all' },
  { label: 'Expense', value: 'Expense' },
  { label: 'Deposit', value: 'Deposit' },
  { label: 'Transfer', value: 'Transfer' },
  { label: 'Check', value: 'Check' },
  { label: 'Debit', value: 'debit' },
  { label: 'Credit', value: 'credit' }
] as const;

const statusColor = (status?: string | null) => {
  if (status === 'posted') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'posting') return 'info';
  if (status === 'not_posted') return 'warning';
  return 'default';
};

const columns: GridColDef<QuickBooksHubOperationRow>[] = [
  {
    field: 'date',
    headerName: 'Date',
    width: 140,
    renderCell: (params) => formatDate(String(params.value ?? ''), 'short')
  },
  { field: 'type', headerName: 'Type', width: 140 },
  { field: 'description', headerName: 'Description', flex: 1, minWidth: 220 },
  { field: 'payee', headerName: 'Payee', width: 180 },
  {
    field: 'amount',
    headerName: 'Amount',
    width: 140,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) =>
      params.value == null
        ? '-'
        : Number(params.value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: (params) => (
      <Chip size="small" color={statusColor(params.value) as any} label={params.value ?? 'unknown'} />
    )
  },
  { field: 'qbId', headerName: 'QuickBooks ID', width: 160 },
  {
    field: 'error',
    headerName: 'Issue',
    flex: 1,
    minWidth: 220,
    renderCell: (params) => <Typography variant="body2">{params.value ?? 'No issues'}</Typography>
  }
];

export const QuickBooksOperationsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const {
    loading: workspaceLoading,
    isConnected,
    error: workspaceError,
    warning: workspaceWarning
  } = useQuickBooksWorkspace(canView);

  const [rows, setRows] = useState<QuickBooksHubOperationRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<QuickBooksHubSortModel>([
    { field: 'date', sort: 'desc' }
  ]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'not_posted' | 'posting' | 'posted' | 'failed'
  >('all');
  const [typeFilter, setTypeFilter] = useState<
    'all' | 'Expense' | 'Deposit' | 'Transfer' | 'Check' | 'debit' | 'credit'
  >('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksHubOperations({
        page,
        pageSize,
        search: search || undefined,
        sort: quickBooksHubSortToParam(sortModel) as QuickBooksHubOperationsParams['sort'],
        status: statusFilter === 'all' ? undefined : statusFilter,
        type: typeFilter === 'all' ? undefined : typeFilter
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks operations'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortModel, statusFilter, typeFilter]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const filters = useMemo(
    () => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <TextField
          select
          size="small"
          label="Status"
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as typeof statusFilter);
            setPage(1);
          }}
          sx={{ minWidth: 160 }}
        >
          {statusOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Type"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value as typeof typeFilter);
            setPage(1);
          }}
          sx={{ minWidth: 160 }}
        >
          {typeOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    ),
    [statusFilter, typeFilter]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Operations Hub"
        subtitle="Review posting outcomes and ledger-linked operational rows."
        icon={<SyncAltIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Typography variant="body2" color="text.secondary">
          Operational rows are loaded from the QuickBooks hub operations endpoint.
        </Typography>
        <SmartTable
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          rowCount={rowCount}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(value) => {
            setPageSize(value);
            setPage(1);
          }}
          sortModel={sortModel}
          onSortModelChange={(model: GridSortModel) => {
            setSortModel(model);
            setPage(1);
          }}
          searchValue={search}
          onSearchValueChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder="Search operations"
          filters={filters}
          loading={loading}
          error={error}
          emptyText="No QuickBooks operations found."
          onRefresh={load}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksOperationsPage;
