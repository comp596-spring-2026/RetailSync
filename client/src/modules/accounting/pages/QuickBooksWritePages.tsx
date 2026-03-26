import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { type GridColDef, type GridSortModel } from '@mui/x-data-grid';
import {
  QuickBooksWriteCreateInput,
  QuickBooksWriteDetail,
  QuickBooksWriteInvoiceCreateInput,
  QuickBooksWriteInvoiceUpdateInput,
  QuickBooksWriteListItem,
  QuickBooksWriteListQuery,
  QuickBooksWriteLine,
  QuickBooksWriteLinkedTransaction,
  QuickBooksWritePaymentCreateInput,
  QuickBooksWritePaymentUpdateInput,
  QuickBooksWriteSalesLineInput,
  QuickBooksWriteSalesReceiptCreateInput,
  QuickBooksWriteSalesReceiptUpdateInput,
  QuickBooksWriteTxnType,
  QuickBooksWriteUpdateInput
} from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { NoAccess, PageHeader, SmartTable } from '../../../components';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

type WriteMode = 'create' | 'edit';

type WriteLineForm = {
  description: string;
  amount: string;
  itemId: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string;
  serviceDate: string;
};

type WriteLinkedTransactionForm = {
  txnId: string;
  txnType: 'Invoice' | 'CreditMemo';
  amount: string;
};

type WriteFormState = {
  customerId: string;
  txnDate: string;
  docNumber: string;
  memo: string;
  customerMemo: string;
  customerEmail: string;
  depositAccountId: string;
  paymentMethodId: string;
  dueDate: string;
  arAccountId: string;
  totalAmount: string;
  lines: WriteLineForm[];
  linkedTransactions: WriteLinkedTransactionForm[];
};

const txnTypeMeta: Record<
  QuickBooksWriteTxnType,
  { label: string; singular: string; path: string; title: string; description: string }
> = {
  'sales-receipt': {
    label: 'Sales Receipts',
    singular: 'Sales Receipt',
    path: '/dashboard/quickbooks/write/sales-receipt',
    title: 'QuickBooks Sales Receipts',
    description: 'Browse and create QuickBooks sales receipts with stateless live-write flows.'
  },
  invoice: {
    label: 'Invoices',
    singular: 'Invoice',
    path: '/dashboard/quickbooks/write/invoice',
    title: 'QuickBooks Invoices',
    description: 'Browse and create QuickBooks invoices with stateless live-write flows.'
  },
  payment: {
    label: 'Payments',
    singular: 'Payment',
    path: '/dashboard/quickbooks/write/payment',
    title: 'QuickBooks Payments',
    description: 'Browse and create QuickBooks payments with stateless live-write flows.'
  }
};

const isWriteTxnType = (value: string | undefined): value is QuickBooksWriteTxnType =>
  value === 'sales-receipt' || value === 'invoice' || value === 'payment';

const writeRootPath = '/dashboard/quickbooks/write';

const writeListPath = (txnType: QuickBooksWriteTxnType) => `${writeRootPath}/${txnType}`;
const writeCreatePath = (txnType: QuickBooksWriteTxnType) => `${writeListPath(txnType)}/new`;
const writeDetailPath = (txnType: QuickBooksWriteTxnType, qbTxnId: string) =>
  `${writeListPath(txnType)}/${qbTxnId}`;
const writeEditPath = (txnType: QuickBooksWriteTxnType, qbTxnId: string) =>
  `${writeDetailPath(txnType, qbTxnId)}/edit`;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '-' : currencyFormatter.format(value);

const statusColor = (status?: string | null) => {
  if (status === 'paid' || status === 'closed' || status === 'applied') return 'success';
  if (status === 'open') return 'warning';
  if (status === 'unapplied') return 'info';
  return 'default';
};

const blankSalesLine = (): WriteLineForm => ({
  description: '',
  amount: '',
  itemId: '',
  quantity: '',
  unitPrice: '',
  taxCodeId: '',
  serviceDate: ''
});

const blankLinkedTransaction = (): WriteLinkedTransactionForm => ({
  txnId: '',
  txnType: 'Invoice',
  amount: ''
});

const createBlankForm = (txnType: QuickBooksWriteTxnType): WriteFormState => ({
  customerId: '',
  txnDate: new Date().toISOString().slice(0, 10),
  docNumber: '',
  memo: '',
  customerMemo: '',
  customerEmail: '',
  depositAccountId: '',
  paymentMethodId: '',
  dueDate: new Date().toISOString().slice(0, 10),
  arAccountId: '',
  totalAmount: '',
  lines:
    txnType === 'payment'
      ? []
      : [blankSalesLine()],
  linkedTransactions: txnType === 'payment' ? [] : []
});

const mapLineToForm = (line: QuickBooksWriteLine): WriteLineForm => ({
  description: line.description ?? '',
  amount: String(line.amount ?? ''),
  itemId: line.itemId ?? '',
  quantity: line.quantity == null ? '' : String(line.quantity),
  unitPrice: line.unitPrice == null ? '' : String(line.unitPrice),
  taxCodeId: line.taxCodeId ?? '',
  serviceDate: line.serviceDate ?? ''
});

const mapLinkedTransactionToForm = (
  linkedTransaction: QuickBooksWriteLinkedTransaction
): WriteLinkedTransactionForm => ({
  txnId: linkedTransaction.txnId,
  txnType: linkedTransaction.txnType === 'CreditMemo' ? 'CreditMemo' : 'Invoice',
  amount: linkedTransaction.amount == null ? '' : String(linkedTransaction.amount)
});

const mapDetailToForm = (txnType: QuickBooksWriteTxnType, detail: QuickBooksWriteDetail): WriteFormState => ({
  customerId: detail.customerId ?? '',
  txnDate: detail.txnDate ?? new Date().toISOString().slice(0, 10),
  docNumber: detail.docNumber ?? '',
  memo: detail.memo ?? '',
  customerMemo: detail.customerMemo ?? '',
  customerEmail: detail.customerEmail ?? '',
  depositAccountId: detail.depositAccountId ?? '',
  paymentMethodId: detail.paymentMethodId ?? '',
  dueDate: detail.dueDate ?? new Date().toISOString().slice(0, 10),
  arAccountId: detail.arAccountId ?? '',
  totalAmount: detail.totalAmount == null ? '' : String(detail.totalAmount),
  lines: txnType === 'payment' ? [] : (detail.lines.length ? detail.lines.map(mapLineToForm) : [blankSalesLine()]),
  linkedTransactions: txnType === 'payment' ? detail.linkedTransactions.map(mapLinkedTransactionToForm) : []
});

const parseOptionalNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseRequiredNumber = (value: string) => Number(value || 0);

const buildSalesLines = (lines: WriteLineForm[]): QuickBooksWriteSalesLineInput[] =>
  lines.map((line) => ({
    description: line.description.trim() || undefined,
    amount: parseRequiredNumber(line.amount),
    itemId: line.itemId.trim(),
    quantity: parseOptionalNumber(line.quantity),
    unitPrice: parseOptionalNumber(line.unitPrice),
    taxCodeId: line.taxCodeId.trim() || undefined,
    serviceDate: line.serviceDate.trim() || undefined
  }));

const buildPaymentLinks = (linkedTransactions: WriteLinkedTransactionForm[]) =>
  linkedTransactions
    .filter((link) => link.txnId.trim() || link.amount.trim())
    .map((link) => ({
      txnId: link.txnId.trim(),
      txnType: link.txnType,
      amount: parseRequiredNumber(link.amount)
    }));

const buildCreatePayload = (
  txnType: QuickBooksWriteTxnType,
  form: WriteFormState
): QuickBooksWriteCreateInput => {
  const base = {
    customerId: form.customerId.trim(),
    txnDate: form.txnDate,
    docNumber: form.docNumber.trim() || undefined,
    memo: form.memo.trim() || undefined,
    customerMemo: form.customerMemo.trim() || undefined,
    customerEmail: form.customerEmail.trim() || undefined
  };

  if (txnType === 'sales-receipt') {
    const payload: QuickBooksWriteSalesReceiptCreateInput = {
      ...base,
      txnType,
      depositAccountId: form.depositAccountId.trim() || undefined,
      paymentMethodId: form.paymentMethodId.trim() || undefined,
      lines: buildSalesLines(form.lines)
    };
    return payload;
  }

  if (txnType === 'invoice') {
    const payload: QuickBooksWriteInvoiceCreateInput = {
      ...base,
      txnType,
      dueDate: form.dueDate.trim() || undefined,
      arAccountId: form.arAccountId.trim() || undefined,
      lines: buildSalesLines(form.lines)
    };
    return payload;
  }

  const payload: QuickBooksWritePaymentCreateInput = {
    ...base,
    txnType,
    totalAmount: parseRequiredNumber(form.totalAmount),
    depositAccountId: form.depositAccountId.trim() || undefined,
    paymentMethodId: form.paymentMethodId.trim() || undefined,
    linkedTransactions: buildPaymentLinks(form.linkedTransactions)
  };
  return payload;
};

const buildUpdatePayload = (
  txnType: QuickBooksWriteTxnType,
  detail: QuickBooksWriteDetail | null,
  form: WriteFormState
): QuickBooksWriteUpdateInput => {
  const base = {
    syncToken: detail?.syncToken ?? '',
    txnDate: form.txnDate.trim() || undefined,
    docNumber: form.docNumber.trim() || undefined,
    memo: form.memo.trim() || undefined,
    customerMemo: form.customerMemo.trim() || undefined,
    customerEmail: form.customerEmail.trim() || undefined
  };

  if (txnType === 'sales-receipt') {
    const payload: QuickBooksWriteSalesReceiptUpdateInput = {
      ...base,
      txnType,
      customerId: form.customerId.trim() || undefined,
      depositAccountId: form.depositAccountId.trim() || undefined,
      paymentMethodId: form.paymentMethodId.trim() || undefined,
      lines: buildSalesLines(form.lines)
    };
    return payload;
  }

  if (txnType === 'invoice') {
    const payload: QuickBooksWriteInvoiceUpdateInput = {
      ...base,
      txnType,
      customerId: form.customerId.trim() || undefined,
      dueDate: form.dueDate.trim() || undefined,
      arAccountId: form.arAccountId.trim() || undefined,
      lines: buildSalesLines(form.lines)
    };
    return payload;
  }

  const payload: QuickBooksWritePaymentUpdateInput = {
    ...base,
    txnType,
    customerId: form.customerId.trim() || undefined,
    totalAmount: parseOptionalNumber(form.totalAmount),
    depositAccountId: form.depositAccountId.trim() || undefined,
    paymentMethodId: form.paymentMethodId.trim() || undefined,
    linkedTransactions: buildPaymentLinks(form.linkedTransactions)
  };
  return payload;
};

const writeTxnColumns = (
  txnType: QuickBooksWriteTxnType,
  canPost: boolean,
  navigate: ReturnType<typeof useNavigate>
): GridColDef<QuickBooksWriteListItem>[] => [
  {
    field: 'txnDate',
    headerName: 'Date',
    width: 120,
    renderCell: (params) => formatDate(String(params.value ?? ''), 'short')
  },
  { field: 'docNumber', headerName: 'Doc #', width: 140 },
  { field: 'customerName', headerName: 'Customer', flex: 1, minWidth: 200 },
  {
    field: 'totalAmount',
    headerName: 'Total',
    width: 140,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  {
    field: 'balanceAmount',
    headerName: 'Balance',
    width: 140,
    align: 'right',
    headerAlign: 'right',
    renderCell: (params) => formatCurrency(params.value as number | null | undefined)
  },
  {
    field: 'status',
    headerName: 'Status',
    width: 130,
    renderCell: (params) => (
      <Chip size="small" color={statusColor(params.value as string | null | undefined) as any} label={String(params.value ?? 'unknown')} />
    )
  },
  { field: 'emailStatus', headerName: 'Email', width: 140 },
  { field: 'qbTxnId', headerName: 'QB Txn ID', width: 180 },
  {
    field: 'actions',
    headerName: 'Actions',
    width: canPost ? 180 : 120,
    sortable: false,
    filterable: false,
    renderCell: (params) => (
      <Stack direction="row" spacing={1}>
        <Button size="small" onClick={() => navigate(writeDetailPath(txnType, params.row.qbTxnId))}>
          View
        </Button>
        {canPost ? (
          <Button size="small" startIcon={<EditIcon fontSize="small" />} onClick={() => navigate(writeEditPath(txnType, params.row.qbTxnId))}>
            Edit
          </Button>
        ) : null}
      </Stack>
    )
  }
];

const WriteTxnTypeTabs = ({ txnType }: { txnType: QuickBooksWriteTxnType }) => {
  const navigate = useNavigate();

  return (
    <Paper sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        sx={{ p: 1 }}
      >
        {Object.entries(txnTypeMeta).map(([value, meta]) => (
          <Button
            key={value}
            variant={txnType === value ? 'contained' : 'text'}
            onClick={() => navigate(writeListPath(value as QuickBooksWriteTxnType))}
          >
            {meta.label}
          </Button>
        ))}
      </Stack>
    </Paper>
  );
};

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

const useWriteWorkspace = (enabled: boolean) => {
  return useQuickBooksWorkspace(enabled);
};

export const QuickBooksWriteListPage = () => {
  const navigate = useNavigate();
  const { txnType: rawTxnType } = useParams<{ txnType: string }>();
  const txnType = isWriteTxnType(rawTxnType) ? rawTxnType : null;
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useWriteWorkspace(canView);

  const [rows, setRows] = useState<QuickBooksWriteListItem[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: 'txnDate', sort: 'desc' }]);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerId, setCustomerId] = useState('');

  const load = useCallback(async () => {
    if (!txnType) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksWriteTransactions(txnType, {
        page,
        pageSize,
        search: search || undefined,
        sort: (sortModel[0]?.field === 'txnDate'
          ? `${sortModel[0]?.sort === 'desc' ? '-' : ''}date`
          : sortModel[0]?.field === 'totalAmount'
            ? `${sortModel[0]?.sort === 'desc' ? '-' : ''}totalAmount`
            : sortModel[0]?.field === 'docNumber'
              ? `${sortModel[0]?.sort === 'desc' ? '-' : ''}docNumber`
              : undefined) as QuickBooksWriteListQuery['sort'],
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        customerId: customerId || undefined
      });
      const payload = response.data.data;
      setRows(payload.items);
      setRowCount(payload.total);
      setPage(payload.page);
      setPageSize(payload.pageSize);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, `Failed to load ${txnType ? txnTypeMeta[txnType].label.toLowerCase() : 'write transactions'}`));
    } finally {
      setLoading(false);
    }
  }, [customerId, endDate, page, pageSize, search, sortModel, startDate, txnType]);

  useEffect(() => {
    if (!canView || !isConnected || !txnType) return;
    void load();
  }, [canView, isConnected, load, txnType]);

  const columns = useMemo(() => {
    if (!txnType) return [];
    return writeTxnColumns(txnType, canPost, navigate);
  }, [canPost, navigate, txnType]);

  const filters = useMemo(
    () => (
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} flexWrap="wrap" useFlexGap>
        <TextField
          type="date"
          size="small"
          label="Start"
          value={startDate}
          onChange={(event) => {
            setStartDate(event.target.value);
            setPage(1);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          type="date"
          size="small"
          label="End"
          value={endDate}
          onChange={(event) => {
            setEndDate(event.target.value);
            setPage(1);
          }}
          InputLabelProps={{ shrink: true }}
          sx={{ minWidth: 150 }}
        />
        <TextField
          size="small"
          label="Customer ID"
          value={customerId}
          onChange={(event) => {
            setCustomerId(event.target.value);
            setPage(1);
          }}
          sx={{ minWidth: 180 }}
        />
      </Stack>
    ),
    [customerId, endDate, startDate]
  );

  if (!canView) {
    return <NoAccess />;
  }

  if (!txnType) {
    return <Navigate to="/404" replace />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={txnTypeMeta[txnType].title}
        subtitle={txnTypeMeta[txnType].description}
        icon={<ReceiptLongIcon />}
      />
      <QuickBooksTabs />
      <WriteTxnTypeTabs txnType={txnType} />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="body2" color="text.secondary">
            Server-driven QuickBooks write rows stay live and stateless after creation or update.
          </Typography>
          {canPost ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => navigate(writeCreatePath(txnType))}
            >
              Create {txnTypeMeta[txnType].singular}
            </Button>
          ) : null}
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
          onSortModelChange={(model) => {
            setSortModel(model);
            setPage(1);
          }}
          searchValue={search}
          onSearchValueChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          searchPlaceholder={`Search ${txnTypeMeta[txnType].label.toLowerCase()}`}
          filters={filters}
          loading={loading}
          error={error}
          emptyText={`No ${txnTypeMeta[txnType].label.toLowerCase()} found.`}
          onRefresh={load}
          checkboxSelection={false}
        />
      </RequireQuickBooksConnection>
    </Stack>
  );
};

const QuickBooksWriteForm = ({
  txnType,
  mode,
  detail,
  onCancel,
  onSubmit,
  submitting
}: {
  txnType: QuickBooksWriteTxnType;
  mode: WriteMode;
  detail: QuickBooksWriteDetail | null;
  onCancel: () => void;
  onSubmit: (payload: QuickBooksWriteCreateInput | QuickBooksWriteUpdateInput) => Promise<void>;
  submitting: boolean;
}) => {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState<WriteFormState>(() => createBlankForm(txnType));

  useEffect(() => {
    if (mode === 'create') {
      setForm(createBlankForm(txnType));
      return;
    }
    if (detail) {
      setForm(mapDetailToForm(txnType, detail));
    }
  }, [detail, mode, txnType]);

  const setSalesLine = (index: number, field: keyof WriteLineForm, value: string) => {
    setForm((prev) => {
      const next = [...prev.lines];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, lines: next };
    });
  };

  const setLinkedTransaction = (index: number, field: keyof WriteLinkedTransactionForm, value: string) => {
    setForm((prev) => {
      const next = [...prev.linkedTransactions];
      next[index] = { ...next[index], [field]: value };
      return { ...prev, linkedTransactions: next };
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      await onSubmit(mode === 'create' ? buildCreatePayload(txnType, form) : buildUpdatePayload(txnType, detail, form));
      dispatch(
        showSnackbar({
          message:
            mode === 'create'
              ? `${txnTypeMeta[txnType].singular} created.`
              : `${txnTypeMeta[txnType].singular} updated.`,
          severity: 'success'
        })
      );
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, `Failed to save ${txnTypeMeta[txnType].singular.toLowerCase()}`),
          severity: 'error'
        })
      );
    }
  };

  const canSubmitEdit = mode === 'create' || Boolean(detail?.syncToken);

  return (
    <Paper sx={{ p: 2 }}>
      <Box component="form" onSubmit={submit}>
        <Stack spacing={2}>
          {!canSubmitEdit ? <Alert severity="warning">This record cannot be edited because the sync token is missing.</Alert> : null}

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>
              Common Details
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
              <TextField
                label="Customer ID"
                value={form.customerId}
                onChange={(event) => setForm((prev) => ({ ...prev, customerId: event.target.value }))}
                required
              />
              <TextField
                label="Txn Date"
                type="date"
                value={form.txnDate}
                onChange={(event) => setForm((prev) => ({ ...prev, txnDate: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                required
              />
              <TextField
                label="Doc Number"
                value={form.docNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, docNumber: event.target.value }))}
              />
              <TextField
                label="Customer Email"
                value={form.customerEmail}
                onChange={(event) => setForm((prev) => ({ ...prev, customerEmail: event.target.value }))}
              />
              <TextField
                label="Customer Memo"
                value={form.customerMemo}
                onChange={(event) => setForm((prev) => ({ ...prev, customerMemo: event.target.value }))}
                multiline
                minRows={2}
              />
              <TextField
                label="Memo"
                value={form.memo}
                onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                multiline
                minRows={2}
              />
            </Box>
          </Paper>

          {txnType === 'sales-receipt' ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Sales Receipt Fields
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
                <TextField
                  label="Deposit Account ID"
                  value={form.depositAccountId}
                  onChange={(event) => setForm((prev) => ({ ...prev, depositAccountId: event.target.value }))}
                />
                <TextField
                  label="Payment Method ID"
                  value={form.paymentMethodId}
                  onChange={(event) => setForm((prev) => ({ ...prev, paymentMethodId: event.target.value }))}
                />
              </Box>
            </Paper>
          ) : null}

          {txnType === 'invoice' ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Invoice Fields
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
                <TextField
                  label="Due Date"
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  InputLabelProps={{ shrink: true }}
                />
                <TextField
                  label="AR Account ID"
                  value={form.arAccountId}
                  onChange={(event) => setForm((prev) => ({ ...prev, arAccountId: event.target.value }))}
                />
              </Box>
            </Paper>
          ) : null}

          {txnType === 'payment' ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Payment Fields
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' } }}>
                <TextField
                  label="Total Amount"
                  type="number"
                  inputProps={{ min: 0, step: '0.01' }}
                  value={form.totalAmount}
                  onChange={(event) => setForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
                  required
                />
                <TextField
                  label="Deposit Account ID"
                  value={form.depositAccountId}
                  onChange={(event) => setForm((prev) => ({ ...prev, depositAccountId: event.target.value }))}
                />
                <TextField
                  label="Payment Method ID"
                  value={form.paymentMethodId}
                  onChange={(event) => setForm((prev) => ({ ...prev, paymentMethodId: event.target.value }))}
                />
              </Box>
            </Paper>
          ) : null}

          {txnType !== 'payment' ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Line Items</Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setForm((prev) => ({ ...prev, lines: [...prev.lines, blankSalesLine()] }))}
                >
                  Add Line
                </Button>
              </Stack>
              <Stack spacing={2}>
                {form.lines.map((line, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2">Line {index + 1}</Typography>
                        <Button
                          color="error"
                          size="small"
                          disabled={form.lines.length === 1}
                          onClick={() =>
                            setForm((prev) => ({ ...prev, lines: prev.lines.filter((_, lineIndex) => lineIndex !== index) }))
                          }
                        >
                          Remove
                        </Button>
                      </Stack>
                      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                        <TextField
                          label="Item ID"
                          value={line.itemId}
                          onChange={(event) => setSalesLine(index, 'itemId', event.target.value)}
                          required
                        />
                        <TextField
                          label="Amount"
                          type="number"
                          inputProps={{ min: 0, step: '0.01' }}
                          value={line.amount}
                          onChange={(event) => setSalesLine(index, 'amount', event.target.value)}
                          required
                        />
                        <TextField
                          label="Quantity"
                          type="number"
                          inputProps={{ min: 0, step: '0.01' }}
                          value={line.quantity}
                          onChange={(event) => setSalesLine(index, 'quantity', event.target.value)}
                        />
                        <TextField
                          label="Unit Price"
                          type="number"
                          inputProps={{ min: 0, step: '0.01' }}
                          value={line.unitPrice}
                          onChange={(event) => setSalesLine(index, 'unitPrice', event.target.value)}
                        />
                        <TextField
                          label="Tax Code ID"
                          value={line.taxCodeId}
                          onChange={(event) => setSalesLine(index, 'taxCodeId', event.target.value)}
                        />
                        <TextField
                          label="Service Date"
                          type="date"
                          value={line.serviceDate}
                          onChange={(event) => setSalesLine(index, 'serviceDate', event.target.value)}
                          InputLabelProps={{ shrink: true }}
                        />
                      </Box>
                      <TextField
                        label="Description"
                        value={line.description}
                        onChange={(event) => setSalesLine(index, 'description', event.target.value)}
                        multiline
                        minRows={2}
                        fullWidth
                      />
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ) : null}

          {txnType === 'payment' ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="h6">Linked Transactions</Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setForm((prev) => ({ ...prev, linkedTransactions: [...prev.linkedTransactions, blankLinkedTransaction()] }))}
                >
                  Add Link
                </Button>
              </Stack>
              {form.linkedTransactions.length === 0 ? (
                <Alert severity="info">Add linked transactions to apply the payment to invoices or credit memos.</Alert>
              ) : null}
              <Stack spacing={2}>
                {form.linkedTransactions.map((link, index) => (
                  <Paper key={index} variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2">Linked Transaction {index + 1}</Typography>
                        <Button
                          color="error"
                          size="small"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              linkedTransactions: prev.linkedTransactions.filter((_, linkIndex) => linkIndex !== index)
                            }))
                          }
                        >
                          Remove
                        </Button>
                      </Stack>
                      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                        <TextField
                          label="Txn ID"
                          value={link.txnId}
                          onChange={(event) => setLinkedTransaction(index, 'txnId', event.target.value)}
                        />
                        <TextField
                          select
                          label="Txn Type"
                          value={link.txnType}
                          onChange={(event) => setLinkedTransaction(index, 'txnType', event.target.value)}
                        >
                          <MenuItem value="Invoice">Invoice</MenuItem>
                          <MenuItem value="CreditMemo">Credit Memo</MenuItem>
                        </TextField>
                        <TextField
                          label="Amount"
                          type="number"
                          inputProps={{ min: 0, step: '0.01' }}
                          value={link.amount}
                          onChange={(event) => setLinkedTransaction(index, 'amount', event.target.value)}
                        />
                      </Box>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ) : null}

          <Stack direction="row" spacing={1.5} justifyContent="flex-end">
            <Button variant="outlined" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting || !canSubmitEdit}>
              {submitting ? 'Saving...' : mode === 'create' ? `Create ${txnTypeMeta[txnType].singular}` : `Save ${txnTypeMeta[txnType].singular}`}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </Paper>
  );
};

const QuickBooksWriteDetailSections = ({
  txnType,
  detail
}: {
  txnType: QuickBooksWriteTxnType;
  detail: QuickBooksWriteDetail;
}) => {
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Summary
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
          {detailField('Txn Type', detail.txnType)}
          {detailField('Txn Date', detail.txnDate ? formatDate(detail.txnDate, 'short') : null)}
          {detailField('Doc Number', detail.docNumber)}
          {detailField('Customer', detail.customerName ?? detail.customerId)}
          {detailField('Total Amount', formatCurrency(detail.totalAmount))}
          {detailField('Balance Amount', formatCurrency(detail.balanceAmount))}
          {detailField('Status', detail.status)}
          {detailField('Email Status', detail.emailStatus)}
          {detailField('Sync Token', detail.syncToken)}
          {detailField('Due Date', detail.dueDate ? formatDate(detail.dueDate, 'short') : null)}
          {detailField('Customer Email', detail.customerEmail)}
          {detailField('Deposit Account', detail.depositAccountName ?? detail.depositAccountId)}
          {detailField('AR Account', detail.arAccountName ?? detail.arAccountId)}
          {detailField('Payment Method', detail.paymentMethodName ?? detail.paymentMethodId)}
          {detailField('Memo', detail.memo)}
          {detailField('Customer Memo', detail.customerMemo)}
        </Box>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Line Items
        </Typography>
        {detail.lines.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Description</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Unit Price</TableCell>
                <TableCell>Tax Code</TableCell>
                <TableCell>Service Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.lines.map((line, index) => (
                <TableRow key={line.id ?? index}>
                  <TableCell>{line.description ?? '-'}</TableCell>
                  <TableCell>{line.itemName ?? line.itemId ?? '-'}</TableCell>
                  <TableCell align="right">{formatCurrency(line.amount)}</TableCell>
                  <TableCell align="right">{line.quantity ?? '-'}</TableCell>
                  <TableCell align="right">{line.unitPrice == null ? '-' : formatCurrency(line.unitPrice)}</TableCell>
                  <TableCell>{line.taxCodeName ?? line.taxCodeId ?? '-'}</TableCell>
                  <TableCell>{line.serviceDate ? formatDate(line.serviceDate, 'short') : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Alert severity="info">No line items were returned for this record.</Alert>
        )}
      </Paper>

      {txnType === 'payment' || detail.linkedTransactions.length ? (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Linked Transactions
          </Typography>
          {detail.linkedTransactions.length ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Txn ID</TableCell>
                  <TableCell>Txn Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {detail.linkedTransactions.map((linkedTransaction, index) => (
                  <TableRow key={`${linkedTransaction.txnId}-${index}`}>
                    <TableCell>{linkedTransaction.txnId}</TableCell>
                    <TableCell>{linkedTransaction.txnType}</TableCell>
                    <TableCell align="right">{formatCurrency(linkedTransaction.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert severity="info">No linked transactions were returned for this record.</Alert>
          )}
        </Paper>
      ) : null}

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
          {JSON.stringify(detail.raw, null, 2)}
        </Typography>
      </Paper>
    </Stack>
  );
};

const QuickBooksWriteEditorPage = ({ mode }: { mode: WriteMode }) => {
  const navigate = useNavigate();
  const { txnType: rawTxnType, qbTxnId } = useParams<{ txnType: string; qbTxnId?: string }>();
  const txnType = isWriteTxnType(rawTxnType) ? rawTxnType : null;
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useWriteWorkspace(canView);

  const [detail, setDetail] = useState<QuickBooksWriteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (mode !== 'edit') {
      setLoading(false);
      return;
    }
    if (!txnType || !qbTxnId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksWriteTransactionDetail(txnType, qbTxnId);
      setDetail(response.data.data);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks write detail'));
    } finally {
      setLoading(false);
    }
  }, [mode, qbTxnId, txnType]);

  useEffect(() => {
    if (!canView || !isConnected || !txnType || (mode === 'edit' && !qbTxnId)) return;
    void load();
  }, [canView, isConnected, load, mode, qbTxnId, txnType]);

  if (!canView) {
    return <NoAccess />;
  }

  if (!txnType || (mode === 'edit' && !qbTxnId)) {
    return <Navigate to="/404" replace />;
  }

  const handleSave = async (payload: QuickBooksWriteCreateInput | QuickBooksWriteUpdateInput) => {
    if (mode === 'create') {
      setSubmitting(true);
      try {
        const response = await accountingApi.postQuickbooksWriteTransaction(txnType, payload as QuickBooksWriteCreateInput);
        navigate(writeDetailPath(txnType, response.data.data.qbTxnId), { replace: true });
      } finally {
        setSubmitting(false);
      }
      return;
    }

    setSubmitting(true);
    try {
      if (!qbTxnId) {
        return;
      }
      const response = await accountingApi.patchQuickbooksWriteTransaction(
        txnType,
        qbTxnId,
        payload as QuickBooksWriteUpdateInput
      );
      navigate(writeDetailPath(txnType, response.data.data.qbTxnId), { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  const onCancel = () => {
    if (mode === 'create') {
      navigate(writeListPath(txnType));
      return;
    }
    if (!qbTxnId) {
      navigate(writeListPath(txnType));
      return;
    }
    navigate(writeDetailPath(txnType, qbTxnId));
  };

  const title =
    mode === 'create'
      ? `Create ${txnTypeMeta[txnType].singular}`
      : `Edit ${txnTypeMeta[txnType].singular}`;
  const showForm = mode === 'create' || detail !== null;

  if (mode === 'edit' && !canPost) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader title={title} subtitle={txnTypeMeta[txnType].description} icon={<ReceiptLongIcon />} />
      <QuickBooksTabs />
      <WriteTxnTypeTabs txnType={txnType} />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        {error ? <Alert severity="error">{error}</Alert> : null}
        {mode === 'edit' && loading ? <Alert severity="info">Loading write detail...</Alert> : null}
        {showForm ? (
          <QuickBooksWriteForm
            txnType={txnType}
            mode={mode}
            detail={mode === 'edit' ? detail : null}
            submitting={submitting}
            onCancel={onCancel}
            onSubmit={handleSave}
          />
        ) : null}
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export const QuickBooksWriteDetailPage = () => {
  const { txnType: rawTxnType, qbTxnId } = useParams<{ txnType: string; qbTxnId: string }>();
  if (!isWriteTxnType(rawTxnType) || !qbTxnId) {
    return <Navigate to="/404" replace />;
  }

  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useWriteWorkspace(canView);

  const [detail, setDetail] = useState<QuickBooksWriteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksWriteTransactionDetail(rawTxnType, qbTxnId);
      setDetail(response.data.data);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks write detail'));
    } finally {
      setLoading(false);
    }
  }, [qbTxnId, rawTxnType]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`${txnTypeMeta[rawTxnType].singular} Detail`}
        subtitle="Inspect the live QuickBooks write payload before editing or reloading."
        icon={<ReceiptLongIcon />}
      />
      <QuickBooksTabs />
      <WriteTxnTypeTabs txnType={rawTxnType} />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button variant="outlined" onClick={() => navigate(writeListPath(rawTxnType))}>
            Back to list
          </Button>
          {canPost ? (
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => navigate(writeEditPath(rawTxnType, qbTxnId))}>
              Edit
            </Button>
          ) : null}
          <Button variant="outlined" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </Stack>
        {loading ? <Alert severity="info">Loading write detail...</Alert> : null}
        {error ? <Alert severity="error">{error}</Alert> : null}
        {detail ? <QuickBooksWriteDetailSections txnType={rawTxnType} detail={detail} /> : null}
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export const QuickBooksWriteCreatePage = () => {
  const { txnType: rawTxnType } = useParams<{ txnType: string }>();
  if (!isWriteTxnType(rawTxnType)) {
    return <Navigate to="/404" replace />;
  }

  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');

  if (!canView || !canPost) {
    return <NoAccess />;
  }

  return <QuickBooksWriteEditorPage mode="create" />;
};

export const QuickBooksWriteEditPage = () => {
  const { txnType: rawTxnType } = useParams<{ txnType: string }>();
  if (!isWriteTxnType(rawTxnType)) {
    return <Navigate to="/404" replace />;
  }

  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');

  if (!canView || !canPost) {
    return <NoAccess />;
  }

  return <QuickBooksWriteEditorPage mode="edit" />;
};

export const QuickBooksSalesReceiptsPage = () => {
  const { txnType } = useParams<{ txnType: string }>();
  if (txnType && txnType !== 'sales-receipt') {
    return <Navigate to="/404" replace />;
  }
  return <QuickBooksWriteListPage />;
};

export const QuickBooksInvoicesPage = () => {
  const { txnType } = useParams<{ txnType: string }>();
  if (txnType && txnType !== 'invoice') {
    return <Navigate to="/404" replace />;
  }
  return <QuickBooksWriteListPage />;
};

export const QuickBooksPaymentsPage = () => {
  const { txnType } = useParams<{ txnType: string }>();
  if (txnType && txnType !== 'payment') {
    return <Navigate to="/404" replace />;
  }
  return <QuickBooksWriteListPage />;
};

export default QuickBooksWriteListPage;
