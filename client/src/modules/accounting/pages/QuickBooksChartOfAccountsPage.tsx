import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { NoAccess, PageHeader, SmartTable } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import {
  quickBooksHubSortToParam,
  type QuickBooksHubChartOfAccountsParams,
  type QuickBooksChartOfAccountsRow,
  type QuickBooksHubSortModel
} from '../types/quickbooksHub';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'System', value: 'system' }
] as const;

const columns: GridColDef<QuickBooksChartOfAccountsRow>[] = [
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 220 },
  { field: 'type', headerName: 'Type', width: 160 },
  { field: 'detailType', headerName: 'Detail Type', width: 180 },
  {
    field: 'balance',
    headerName: 'Balance',
    width: 150,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) =>
      params.value == null ? '-' : currencyFormatter.format(Number(params.value))
  },
  { field: 'qbId', headerName: 'QuickBooks ID', width: 160 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: (params) => (
      <Chip
        size="small"
        color={params.value === 'active' ? 'success' : 'default'}
        label={String(params.value ?? 'unknown')}
      />
    )
  }
];

export const QuickBooksChartOfAccountsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const {
    loading: workspaceLoading,
    isConnected,
    error: workspaceError,
    warning: workspaceWarning
  } = useQuickBooksWorkspace(canView);

  const [rows, setRows] = useState<QuickBooksChartOfAccountsRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<QuickBooksHubSortModel>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'system'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        page,
        pageSize,
        search: search || undefined,
        sort: quickBooksHubSortToParam(sortModel) as QuickBooksHubChartOfAccountsParams['sort'],
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load chart of accounts'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortModel, statusFilter]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const filters = useMemo(
    () => (
      <TextField
        select
        size="small"
        label="Status"
        value={statusFilter}
        onChange={(event) => {
          setStatusFilter(event.target.value as typeof statusFilter);
          setPage(1);
        }}
        sx={{ minWidth: 140 }}
      >
        {statusOptions.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>
    ),
    [statusFilter]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Chart of Accounts"
        subtitle="Browse synced QuickBooks accounts with server-side paging, search, and sorting."
        icon={<AccountBalanceIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Typography variant="body2" color="text.secondary">
          Rows are sourced from the QuickBooks hub chart-of-accounts endpoint.
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
          searchPlaceholder="Search chart of accounts"
          filters={filters}
          loading={loading}
          error={error}
          emptyText="No chart of accounts rows found."
          onRefresh={load}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksChartOfAccountsPage;
