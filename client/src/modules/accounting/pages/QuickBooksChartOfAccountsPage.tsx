import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import {
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

export const QuickBooksChartOfAccountsPage = () => {
  const navigate = useNavigate();
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
  const [typeFilter, setTypeFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        page,
        pageSize,
        search: search || undefined,
        sort: quickBooksHubSortToParam(sortModel) as QuickBooksHubChartOfAccountsParams['sort'],
        status: statusFilter === 'all' ? undefined : statusFilter,
        type: typeFilter || undefined
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
  }, [page, pageSize, search, sortModel, statusFilter, typeFilter]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const accountTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    rows.forEach((row) => {
      if (row.type) seen.add(row.type);
    });
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const summary = useMemo(() => {
    const activeCount = rows.filter((row) => row.status === 'active').length;
    const systemCount = rows.filter((row) => row.status === 'system').length;
    const totalBalance = rows.reduce((sum, row) => sum + (row.balance ?? 0), 0);
    return [
      { label: 'Loaded rows', value: String(rows.length) },
      { label: 'Active', value: String(activeCount) },
      { label: 'System', value: String(systemCount) },
      { label: 'Visible balance', value: currencyFormatter.format(totalBalance) }
    ];
  }, [rows]);

  const columns = useMemo<GridColDef<QuickBooksChartOfAccountsRow>[]>(() => [
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
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 140,
      sortable: false,
      filterable: false,
      renderCell: (params) =>
        params.row.qbId ? (
          <Button
            size="small"
            onClick={() =>
              navigate(`/dashboard/quickbooks/accounts/${params.row.qbId}/register`)
            }
          >
            Register
          </Button>
        ) : (
          <Typography variant="caption" color="text.secondary">
            -
          </Typography>
        )
    }
  ], [navigate]);

  const filters = useMemo(
    () => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} flexWrap="wrap" useFlexGap>
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
        <TextField
          select
          size="small"
          label="Type"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All</MenuItem>
          {accountTypeOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    ),
    [accountTypeOptions, statusFilter, typeFilter]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Chart of Accounts"
        subtitle="Review accounts, filter by type, and drill directly into the live register."
        icon={<AccountBalanceIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Stack
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              xl: 'repeat(4, minmax(0, 1fr))'
            }
          }}
        >
          {summary.map((item) => (
            <Paper key={item.label} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}>
              <Stack spacing={0.35}>
                <Typography variant="caption" color="text.secondary">
                  {item.label}
                </Typography>
                <Typography variant="h6">{item.value}</Typography>
              </Stack>
            </Paper>
          ))}
        </Stack>
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
          checkboxSelection={false}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksChartOfAccountsPage;
