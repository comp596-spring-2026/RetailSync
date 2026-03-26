import StorefrontIcon from '@mui/icons-material/Storefront';
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
  type QuickBooksHubEntitiesParams,
  type QuickBooksHubEntityRow,
  type QuickBooksHubSortModel
} from '../types/quickbooksHub';

const columns: GridColDef<QuickBooksHubEntityRow>[] = [
  { field: 'displayName', headerName: 'Display Name', flex: 1, minWidth: 220 },
  { field: 'email', headerName: 'Email', flex: 1, minWidth: 220 },
  { field: 'phone', headerName: 'Phone', width: 160 },
  {
    field: 'balance',
    headerName: 'Balance',
    width: 150,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) =>
      params.value == null
        ? '-'
        : Number(params.value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
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

const statusOptions = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' }
] as const;

export const QuickBooksVendorsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const {
    loading: workspaceLoading,
    isConnected,
    error: workspaceError,
    warning: workspaceWarning
  } = useQuickBooksWorkspace(canView);

  const [rows, setRows] = useState<QuickBooksHubEntityRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<QuickBooksHubSortModel>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksHubEntities('vendor', {
        page,
        pageSize,
        search: search || undefined,
        sort: quickBooksHubSortToParam(sortModel) as QuickBooksHubEntitiesParams['sort'],
        status: statusFilter === 'all' ? undefined : statusFilter
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks vendors'));
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
        title="QuickBooks Vendors"
        subtitle="Search, filter, and review vendor references from the connected QuickBooks company."
        icon={<StorefrontIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Typography variant="body2" color="text.secondary">
          Vendor rows are loaded from the QuickBooks hub entities endpoint.
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
          searchPlaceholder="Search vendors"
          filters={filters}
          loading={loading}
          error={error}
          emptyText="No vendors found."
          onRefresh={load}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksVendorsPage;
