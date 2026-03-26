import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography
} from '@mui/material';
import { type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import {
  QuickBooksAccountRegisterQuery,
  QuickBooksAccountRegisterRow,
  QuickBooksLiveTransactionListItem,
  QuickBooksLiveTransactionType,
  QuickBooksLiveTransactionsQuery,
  QuickBooksTransactionDetail
} from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../../app/store/hooks';
import { NoAccess, PageHeader, SmartTable } from '../../../components';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { AccountingTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import { quickBooksHubSortToParam, type QuickBooksHubSortModel } from '../types/quickbooksHub';

const transactionTypeOptions: Array<{
  type: QuickBooksLiveTransactionType;
  label: string;
  path: string;
}> = [
  { type: 'deposit', label: 'Deposits', path: '/dashboard/accounting/transactions/deposits' },
  { type: 'check', label: 'Checks', path: '/dashboard/accounting/transactions/checks' },
  { type: 'expense', label: 'Expenses', path: '/dashboard/accounting/transactions/expenses' },
  { type: 'transfer', label: 'Transfers', path: '/dashboard/accounting/transactions/transfers' }
];

const liveTransactionLabels: Record<QuickBooksLiveTransactionType, string> = {
  deposit: 'Deposits',
  check: 'Checks',
  expense: 'Expenses',
  transfer: 'Transfers'
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '-' : currencyFormatter.format(value);

const isLiveTransactionType = (value: string | undefined): value is QuickBooksLiveTransactionType =>
  value === 'deposit' || value === 'check' || value === 'expense' || value === 'transfer';

const typeFromTxnType = (txnType: string | null | undefined): QuickBooksLiveTransactionType | null => {
  const normalized = txnType?.trim().toLowerCase();
  if (normalized === 'deposit' || normalized === 'check' || normalized === 'expense' || normalized === 'transfer') {
    return normalized;
  }
  return null;
};

const isNavigableQuickBooksTxnId = (qbTxnId: string) => /^\d+$/.test(qbTxnId);

const detailRouteFor = (type: QuickBooksLiveTransactionType, qbTxnId: string) =>
  `/dashboard/accounting/transactions/${type}/${qbTxnId}`;

const liveTransactionsSortToParam = (sortModel: QuickBooksHubSortModel) => {
  const firstSort = sortModel[0];
  if (!firstSort?.field || !firstSort.sort) {
    return undefined;
  }

  const field = firstSort.field === 'txnDate' ? 'date' : firstSort.field;
  return `${firstSort.sort === 'desc' ? '-' : ''}${field}` as QuickBooksLiveTransactionsQuery['sort'];
};

const liveTransactionColumns = (
  type: QuickBooksLiveTransactionType,
  navigate: ReturnType<typeof useNavigate>
): GridColDef<QuickBooksLiveTransactionListItem>[] => [
  {
    field: 'txnDate',
    headerName: 'Date',
    width: 120,
    renderCell: (params) => formatDate(String(params.value ?? ''), 'short')
  },
  { field: 'docNum', headerName: 'Doc #', width: 140 },
  { field: 'payeeName', headerName: 'Payee', flex: 1, minWidth: 200 },
  { field: 'accountName', headerName: 'Account', flex: 1, minWidth: 200 },
  {
    field: 'amount',
    headerName: 'Amount',
    width: 150,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  { field: 'memo', headerName: 'Memo', flex: 1, minWidth: 220 },
  {
    field: 'status',
    headerName: 'Status',
    width: 120,
    renderCell: (params) => (
      <Chip
        size="small"
        color={params.value === 'posted' ? 'success' : 'default'}
        label={String(params.value ?? 'unknown')}
      />
    )
  },
  { field: 'qbTxnId', headerName: 'QB Txn ID', width: 180 },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 120,
    sortable: false,
    filterable: false,
    renderCell: (params) => (
      <Button
        size="small"
        onClick={() => navigate(detailRouteFor(type, params.row.qbTxnId))}
      >
        Open
      </Button>
    )
  }
];

const registerColumns = (
  navigate: ReturnType<typeof useNavigate>
): GridColDef<QuickBooksAccountRegisterRow>[] => [
  {
    field: 'date',
    headerName: 'Date',
    width: 120,
    renderCell: (params) => formatDate(String(params.value ?? ''), 'short')
  },
  { field: 'txnType', headerName: 'Type', width: 140 },
  { field: 'docNum', headerName: 'Doc #', width: 140 },
  { field: 'name', headerName: 'Name', flex: 1, minWidth: 200 },
  { field: 'memo', headerName: 'Memo', flex: 1, minWidth: 220 },
  { field: 'splitAccount', headerName: 'Split Account', flex: 1, minWidth: 200 },
  {
    field: 'amount',
    headerName: 'Amount',
    width: 130,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  {
    field: 'debit',
    headerName: 'Debit',
    width: 130,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  {
    field: 'credit',
    headerName: 'Credit',
    width: 130,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  {
    field: 'balance',
    headerName: 'Balance',
    width: 130,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  { field: 'qbTxnId', headerName: 'QB Txn ID', width: 180 },
  {
    field: 'actions',
    headerName: 'Actions',
    width: 120,
    sortable: false,
    filterable: false,
    renderCell: (params) => {
      const detailType = typeFromTxnType(params.row.txnType);
      const qbTxnId = params.row.qbTxnId;
      if (!detailType || !qbTxnId || !isNavigableQuickBooksTxnId(qbTxnId)) {
        return <Typography variant="caption" color="text.secondary">-</Typography>;
      }
      return (
        <Button
          size="small"
          onClick={() => navigate(detailRouteFor(detailType, qbTxnId))}
        >
          Open
        </Button>
      );
    }
  }
];

const QuickBooksLiveTransactionTabs = ({
  type
}: {
  type: QuickBooksLiveTransactionType;
}) => {
  const navigate = useNavigate();

  return (
    <Paper sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Tabs
        value={type}
        onChange={(_, value: QuickBooksLiveTransactionType) => {
          const target = transactionTypeOptions.find((option) => option.type === value);
          if (target) {
            navigate(target.path);
          }
        }}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {transactionTypeOptions.map((item) => (
          <Tab key={item.type} value={item.type} label={item.label} />
        ))}
      </Tabs>
    </Paper>
  );
};

export const QuickBooksAccountRegisterPage = () => {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useQuickBooksWorkspace(canView);

  const [rows, setRows] = useState<QuickBooksAccountRegisterRow[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<QuickBooksHubSortModel>([{ field: 'date', sort: 'desc' }]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksAccountRegister(accountId, {
        page,
        pageSize,
        search: search || undefined,
        sort: quickBooksHubSortToParam(sortModel) as QuickBooksAccountRegisterQuery['sort']
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load account register'));
    } finally {
      setLoading(false);
    }
  }, [accountId, page, pageSize, search, sortModel]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const columns = useMemo(() => registerColumns(navigate), [navigate]);

  if (!canView) {
    return <NoAccess />;
  }

  if (!accountId) {
    return <Navigate to="/404" replace />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Account Register"
        subtitle={`Review register rows for account ${accountId}.`}
        icon={<AccountBalanceWalletOutlinedIcon />}
      />
      <AccountingTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Paper sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              Account ID
            </Typography>
            <Typography variant="h6">{accountId}</Typography>
          </Stack>
        </Paper>
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
          searchPlaceholder="Search register rows"
          loading={loading}
          error={error}
          emptyText="No register rows found."
          onRefresh={load}
          checkboxSelection={false}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

const QuickBooksLiveTransactionsView = ({
  type
}: {
  type: QuickBooksLiveTransactionType;
}) => {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useQuickBooksWorkspace(canView);

  const [rows, setRows] = useState<QuickBooksLiveTransactionListItem[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<QuickBooksHubSortModel>([{ field: 'txnDate', sort: 'desc' }]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksLiveTransactions(type, {
        page,
        pageSize,
        search: search || undefined,
        sort: (liveTransactionsSortToParam(sortModel) ?? '-date') as QuickBooksLiveTransactionsQuery['sort']
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, `Failed to load ${liveTransactionLabels[type].toLowerCase()}`));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, sortModel, type]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const columns = useMemo(() => liveTransactionColumns(type, navigate), [navigate, type]);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`QuickBooks ${liveTransactionLabels[type]}`}
        subtitle="Browse live QuickBooks transactions and drill into individual records."
        icon={<ReceiptLongIcon />}
      />
      <AccountingTabs />
      <QuickBooksLiveTransactionTabs type={type} />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
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
          searchPlaceholder={`Search ${liveTransactionLabels[type].toLowerCase()}`}
          loading={loading}
          error={error}
          emptyText={`No ${liveTransactionLabels[type].toLowerCase()} found.`}
          onRefresh={load}
          checkboxSelection={false}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export const QuickBooksDepositsPage = () => <QuickBooksLiveTransactionsView type="deposit" />;
export const QuickBooksChecksPage = () => <QuickBooksLiveTransactionsView type="check" />;
export const QuickBooksExpensesPage = () => <QuickBooksLiveTransactionsView type="expense" />;
export const QuickBooksTransfersPage = () => <QuickBooksLiveTransactionsView type="transfer" />;

const detailField = (label: string, value: string | number | null | undefined) => (
  <Stack spacing={0.25}>
    <Typography variant="caption" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={600}>
      {value == null || value === '' ? '-' : value}
    </Typography>
  </Stack>
);

export const QuickBooksTransactionDetailPage = () => {
  const { type: rawType, qbTxnId } = useParams<{ type: string; qbTxnId: string }>();
  const type = isLiveTransactionType(rawType) ? rawType : null;
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useQuickBooksWorkspace(canView);
  const navigate = useNavigate();

  const [detail, setDetail] = useState<QuickBooksTransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!type || !qbTxnId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksTransactionDetail(type, qbTxnId);
      setDetail(response.data.data);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load transaction detail'));
    } finally {
      setLoading(false);
    }
  }, [qbTxnId, type]);

  useEffect(() => {
    if (!canView || !isConnected || !type || !qbTxnId) return;
    void load();
  }, [canView, isConnected, load, qbTxnId, type]);

  if (!canView) {
    return <NoAccess />;
  }

  if (!type || !qbTxnId) {
    return <Navigate to="/404" replace />;
  }

  const backPath = transactionTypeOptions.find((item) => item.type === type)?.path ?? '/dashboard/accounting/transactions/deposits';

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Transaction Detail"
        subtitle="Inspect the live transaction payload and review routing fields."
        icon={<ReceiptLongIcon />}
      />
      <AccountingTabs />
      <QuickBooksLiveTransactionTabs type={type} />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        {error ? <Alert severity="error">{error}</Alert> : null}
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
              <Stack spacing={0.5}>
                <Typography variant="overline" color="text.secondary">
                  {liveTransactionLabels[type]}
                </Typography>
                <Typography variant="h6">{detail?.payeeName ?? detail?.docNum ?? qbTxnId}</Typography>
                <Typography variant="body2" color="text.secondary">
                  QB Txn ID {qbTxnId}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button variant="outlined" onClick={() => navigate(backPath)}>
                  Back to list
                </Button>
                <Button variant="outlined" onClick={() => void load()} disabled={loading}>
                  Refresh
                </Button>
              </Stack>
            </Stack>

            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
              {detailField('Date', detail?.txnDate ? formatDate(detail.txnDate, 'short') : null)}
              {detailField('Document', detail?.docNum)}
              {detailField('Amount', formatCurrency(detail?.amount))}
              {detailField('Payee', detail?.payeeName)}
              {detailField('Memo', detail?.memo)}
              {detailField('Account', detail?.accountName ?? detail?.accountId)}
              {detailField('Category', detail?.categoryAccountName ?? detail?.categoryAccountId)}
              {detailField('From Account', detail?.fromAccountName ?? detail?.fromAccountId)}
              {detailField('To Account', detail?.toAccountName ?? detail?.toAccountId)}
            </Box>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Raw Payload
          </Typography>
          <Typography
            component="pre"
            variant="caption"
            sx={{
              m: 0,
              p: 2,
              borderRadius: 1,
              backgroundColor: 'rgba(15, 23, 42, 0.04)',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}
          >
            {detail ? JSON.stringify(detail.raw, null, 2) : loading ? 'Loading...' : 'No payload available'}
          </Typography>
        </Paper>
      </RequireQuickBooksConnection>
    </Stack>
  );
};
