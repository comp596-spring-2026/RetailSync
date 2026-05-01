import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
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
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { NoAccess, PageHeader, SmartTable } from '../../../components';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import { quickBooksHubSortToParam, type QuickBooksHubSortModel } from '../types/quickbooksHub';

const transactionTypeOptions: Array<{
  type: QuickBooksLiveTransactionType;
  label: string;
  path: string;
}> = [
  { type: 'deposit', label: 'Deposits', path: '/dashboard/quickbooks/money/deposits' },
  { type: 'check', label: 'Checks', path: '/dashboard/quickbooks/money/checks' },
  { type: 'expense', label: 'Expenses', path: '/dashboard/quickbooks/money/expenses' },
  { type: 'transfer', label: 'Transfers', path: '/dashboard/quickbooks/money/transfers' }
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

const inferLiveTransactionTypeFromPath = (pathname: string): QuickBooksLiveTransactionType | null => {
  if (pathname.includes('/money/deposits') || pathname.includes('/transactions/deposit')) {
    return 'deposit';
  }
  if (pathname.includes('/money/checks') || pathname.includes('/transactions/check')) {
    return 'check';
  }
  if (pathname.includes('/money/expenses') || pathname.includes('/transactions/expense')) {
    return 'expense';
  }
  if (pathname.includes('/money/transfers') || pathname.includes('/transactions/transfer')) {
    return 'transfer';
  }
  return null;
};

const typeFromTxnType = (txnType: string | null | undefined): QuickBooksLiveTransactionType | null => {
  const normalized = txnType?.trim().toLowerCase();
  if (normalized === 'deposit' || normalized === 'check' || normalized === 'expense' || normalized === 'transfer') {
    return normalized;
  }
  return null;
};

const isNavigableQuickBooksTxnId = (qbTxnId: string) => /^\d+$/.test(qbTxnId);

const detailRouteFor = (type: QuickBooksLiveTransactionType, qbTxnId: string) =>
  type === 'deposit'
    ? `/dashboard/quickbooks/money/deposits/${qbTxnId}`
    : type === 'check'
      ? `/dashboard/quickbooks/money/checks/${qbTxnId}`
      : type === 'expense'
        ? `/dashboard/quickbooks/money/expenses/${qbTxnId}`
        : `/dashboard/quickbooks/money/transfers/${qbTxnId}`;

const createRouteFor = (type: QuickBooksLiveTransactionType) =>
  type === 'deposit'
    ? '/dashboard/quickbooks/money/deposits/new'
    : type === 'check'
      ? '/dashboard/quickbooks/money/checks/new'
      : type === 'expense'
        ? '/dashboard/quickbooks/money/expenses/new'
        : '/dashboard/quickbooks/money/transfers/new';

const editRouteFor = (type: QuickBooksLiveTransactionType, qbTxnId: string) =>
  type === 'deposit'
    ? `/dashboard/quickbooks/money/deposits/${qbTxnId}/edit`
    : type === 'check'
      ? `/dashboard/quickbooks/money/checks/${qbTxnId}/edit`
      : type === 'expense'
        ? `/dashboard/quickbooks/money/expenses/${qbTxnId}/edit`
        : `/dashboard/quickbooks/money/transfers/${qbTxnId}/edit`;

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
  navigate: ReturnType<typeof useNavigate>,
  canPost: boolean
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
    width: canPost ? 180 : 120,
    sortable: false,
    filterable: false,
    renderCell: (params) => (
      <Stack direction="row" spacing={1}>
        <Button
          size="small"
          onClick={() => navigate(detailRouteFor(type, params.row.qbTxnId))}
        >
          Open
        </Button>
        {canPost ? (
          <Button
            size="small"
            onClick={() => navigate(editRouteFor(type, params.row.qbTxnId))}
          >
            Edit
          </Button>
        ) : null}
      </Stack>
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

const QuickBooksLiveTransactionButtons = ({
  type
}: {
  type: QuickBooksLiveTransactionType;
}) => {
  const navigate = useNavigate();

  return (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {transactionTypeOptions.map((item) => (
        <Button
          key={item.type}
          variant={item.type === type ? 'contained' : 'outlined'}
          onClick={() => navigate(item.path)}
        >
          {item.label}
        </Button>
      ))}
    </Stack>
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
  const [accountName, setAccountName] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);

  useEffect(() => {
    if (!accountId || !canView || !isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await accountingApi.getQuickbooksHubChartOfAccounts({
          page: 1,
          pageSize: 200,
          status: 'active',
          sort: 'name'
        });
        if (cancelled) return;
        const match = response.data.data.items.find((row) => row.qbId === accountId);
        if (match) {
          setAccountName(match.name ?? null);
          setAccountType(match.type ?? null);
        }
      } catch {
        // Silent — header will fall back to the account ID.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, canView, isConnected]);

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
        subtitle={`Review register rows for ${accountName ?? `account ${accountId}`}.`}
        icon={<AccountBalanceWalletOutlinedIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Paper sx={{ p: 2 }}>
          <Stack spacing={0.5}>
            <Typography variant="body2" color="text.secondary">
              Account
            </Typography>
            <Typography variant="h6">{accountName ?? accountId}</Typography>
            {accountType ? (
              <Typography variant="caption" color="text.secondary">
                {accountType}
              </Typography>
            ) : null}
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
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
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

  const columns = useMemo(() => liveTransactionColumns(type, navigate, canPost), [canPost, navigate, type]);

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
      <QuickBooksTabs />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }}>
        <QuickBooksLiveTransactionButtons type={type} />
        {canPost ? (
          <Button variant="contained" onClick={() => navigate(createRouteFor(type))}>
            {type === 'check'
              ? 'Write check'
              : type === 'expense'
                ? 'New expense'
                : type === 'deposit'
                  ? 'New deposit'
                  : 'New transfer'}
          </Button>
        ) : null}
      </Stack>
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
  const location = useLocation();
  const { type: rawType, qbTxnId } = useParams<{ type: string; qbTxnId: string }>();
  const type = isLiveTransactionType(rawType)
    ? rawType
    : inferLiveTransactionTypeFromPath(location.pathname);
  const permissions = useAppSelector((state) => state.auth.permissions);
  const dispatch = useAppDispatch();
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
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

  const backPath = transactionTypeOptions.find((item) => item.type === type)?.path ?? '/dashboard/quickbooks/money/deposits';

  const onDelete = async () => {
    if (!window.confirm(`Delete this ${type} in QuickBooks?`)) {
      return;
    }

    try {
      await accountingApi.deleteQuickbooksMoneyTransaction(type, qbTxnId);
      dispatch(
        showSnackbar({
          message: `${liveTransactionLabels[type].slice(0, -1)} deleted in QuickBooks.`,
          severity: 'success'
        })
      );
      navigate(backPath);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to delete transaction'));
    }
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Transaction Detail"
        subtitle="Inspect the live transaction payload and review routing fields."
        icon={<ReceiptLongIcon />}
      />
      <QuickBooksTabs />
      <QuickBooksLiveTransactionButtons type={type} />
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
                {canPost ? (
                  <Button variant="outlined" onClick={() => navigate(editRouteFor(type, qbTxnId))}>
                    Edit
                  </Button>
                ) : null}
                {canPost ? (
                  <Button color="error" variant="outlined" onClick={() => void onDelete()} disabled={loading}>
                    Delete
                  </Button>
                ) : null}
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
      </RequireQuickBooksConnection>
    </Stack>
  );
};
