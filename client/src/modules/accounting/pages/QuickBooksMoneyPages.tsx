import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import type {
  QuickBooksMoneyCreateInput,
  QuickBooksMoneyTxnType,
  QuickBooksMoneyUpdateInput
} from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../../app/store/hooks';
import { NoAccess, PageHeader } from '../../../components';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

type MoneyFormState = {
  txnDate: string;
  amount: string;
  memo: string;
  bankAccountId: string;
  categoryAccountId: string;
  payeeRefId: string;
  fromAccountId: string;
  toAccountId: string;
};

type AccountOption = {
  qbId: string;
  name: string;
  type: string | null;
  detailType: string | null;
  balance: number | null;
};

type VendorOption = {
  qbId: string;
  displayName: string;
};

const moneyTypeMeta: Record<
  QuickBooksMoneyTxnType,
  { label: string; path: string; subtitle: string; createLabel: string }
> = {
  check: {
    label: 'Checks',
    path: '/dashboard/quickbooks/money/checks',
    subtitle: 'Write and manage check transactions against the connected QuickBooks company.',
    createLabel: 'Write Check'
  },
  expense: {
    label: 'Expenses',
    path: '/dashboard/quickbooks/money/expenses',
    subtitle: 'Create and manage cash-style expense transactions from the Money workspace.',
    createLabel: 'New Expense'
  },
  deposit: {
    label: 'Deposits',
    path: '/dashboard/quickbooks/money/deposits',
    subtitle: 'Create and manage deposit transactions without leaving QuickBooks Money.',
    createLabel: 'New Deposit'
  },
  transfer: {
    label: 'Transfers',
    path: '/dashboard/quickbooks/money/transfers',
    subtitle: 'Create and manage account-to-account transfers in QuickBooks.',
    createLabel: 'New Transfer'
  }
};

const inferMoneyTypeFromPath = (pathname: string): QuickBooksMoneyTxnType | null => {
  if (pathname.includes('/money/checks')) return 'check';
  if (pathname.includes('/money/expenses')) return 'expense';
  if (pathname.includes('/money/deposits')) return 'deposit';
  if (pathname.includes('/money/transfers')) return 'transfer';
  return null;
};

const blankMoneyForm = (): MoneyFormState => ({
  txnDate: new Date().toISOString().slice(0, 10),
  amount: '',
  memo: '',
  bankAccountId: '',
  categoryAccountId: '',
  payeeRefId: '',
  fromAccountId: '',
  toAccountId: ''
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '-' : currencyFormatter.format(value);

const normalizeAccountType = (value: string | null | undefined) => String(value ?? '').trim().toLowerCase();

const isBankLikeAccount = (account: AccountOption) => {
  const type = normalizeAccountType(account.type);
  const detailType = normalizeAccountType(account.detailType);
  return (
    type === 'bank' ||
    detailType === 'checking' ||
    detailType === 'savings' ||
    detailType === 'cashonhand' ||
    detailType === 'cash on hand'
  );
};

const accountDescriptor = (account: AccountOption | undefined) =>
  [account?.type, account?.detailType].filter(Boolean).join(' / ') || 'QuickBooks account';

const selectedAccount = (accounts: AccountOption[], qbId: string) =>
  accounts.find((account) => account.qbId === qbId);

const selectedVendor = (vendors: VendorOption[], qbId: string) =>
  vendors.find((vendor) => vendor.qbId === qbId);

const buildMoneyPayload = (
  txnType: QuickBooksMoneyTxnType,
  form: MoneyFormState
): QuickBooksMoneyCreateInput | QuickBooksMoneyUpdateInput => {
  const amount = Number(form.amount || 0);

  if (txnType === 'check') {
    return {
      txnType,
      txnDate: form.txnDate,
      amount,
      memo: form.memo.trim() || undefined,
      bankAccountId: form.bankAccountId,
      categoryAccountId: form.categoryAccountId,
      payeeRefId: form.payeeRefId || undefined
    };
  }

  if (txnType === 'expense') {
    return {
      txnType,
      txnDate: form.txnDate,
      amount,
      memo: form.memo.trim() || undefined,
      bankAccountId: form.bankAccountId,
      categoryAccountId: form.categoryAccountId,
      payeeRefId: form.payeeRefId || undefined
    };
  }

  if (txnType === 'deposit') {
    return {
      txnType,
      txnDate: form.txnDate,
      amount,
      memo: form.memo.trim() || undefined,
      bankAccountId: form.bankAccountId,
      categoryAccountId: form.categoryAccountId
    };
  }

  return {
    txnType,
    txnDate: form.txnDate,
    amount,
    memo: form.memo.trim() || undefined,
    fromAccountId: form.fromAccountId,
    toAccountId: form.toAccountId
  };
};

const mapDetailToForm = (detail: Awaited<ReturnType<typeof accountingApi.getQuickbooksTransactionDetail>>['data']['data']): MoneyFormState => ({
  txnDate: detail.txnDate ?? new Date().toISOString().slice(0, 10),
  amount: detail.amount == null ? '' : String(detail.amount),
  memo: detail.memo ?? '',
  bankAccountId: detail.accountId ?? '',
  categoryAccountId: detail.categoryAccountId ?? '',
  payeeRefId: detail.payeeId ?? '',
  fromAccountId: detail.fromAccountId ?? '',
  toAccountId: detail.toAccountId ?? ''
});

export const QuickBooksMoneyEditorPage = ({ mode }: { mode: 'create' | 'edit' }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { qbTxnId } = useParams<{ qbTxnId?: string }>();
  const txnType = inferMoneyTypeFromPath(location.pathname);
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } =
    useQuickBooksWorkspace(canView);

  const [form, setForm] = useState<MoneyFormState>(() => blankMoneyForm());
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    const [accountsResponse, vendorsResponse] = await Promise.all([
      accountingApi.getQuickbooksHubChartOfAccounts({
        page: 1,
        pageSize: 200,
        status: 'active',
        sort: 'name'
      }),
      accountingApi.getQuickbooksHubEntities('vendor', {
        page: 1,
        pageSize: 200,
        status: 'active',
        sort: 'displayName'
      })
    ]);

    setAccounts(
      accountsResponse.data.data.items
        .filter((row) => row.qbId)
        .map((row) => ({
          qbId: row.qbId ?? '',
          name: row.name,
          type: row.type,
          detailType: row.detailType,
          balance: row.balance
        }))
    );
    setVendors(
      vendorsResponse.data.data.items.map((row) => ({
        qbId: row.qbId,
        displayName: row.displayName
      }))
    );
  }, []);

  const loadDetail = useCallback(async () => {
    if (!txnType || mode !== 'edit' || !qbTxnId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getQuickbooksTransactionDetail(txnType, qbTxnId);
      setForm(mapDetailToForm(response.data.data));
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks money transaction'));
    } finally {
      setLoading(false);
    }
  }, [mode, qbTxnId, txnType]);

  useEffect(() => {
    if (!canView || !isConnected || !txnType) return;
    void loadOptions();
  }, [canView, isConnected, loadOptions, txnType]);

  useEffect(() => {
    if (!canView || !isConnected || mode !== 'edit' || !txnType || !qbTxnId) return;
    void loadDetail();
  }, [canView, isConnected, loadDetail, mode, qbTxnId, txnType]);

  const onSubmit = async () => {
    if (!txnType) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildMoneyPayload(txnType, form);
      const response =
        mode === 'create'
          ? await accountingApi.postQuickbooksMoneyTransaction(txnType, payload as QuickBooksMoneyCreateInput)
          : await accountingApi.patchQuickbooksMoneyTransaction(
              txnType,
              qbTxnId ?? '',
              payload as QuickBooksMoneyUpdateInput
            );

      navigate(`${moneyTypeMeta[txnType].path}/${response.data.data.qbTxnId}`, { replace: true });
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to save QuickBooks money transaction'));
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    if (!txnType) return;
    if (mode === 'edit' && qbTxnId) {
      navigate(`${moneyTypeMeta[txnType].path}/${qbTxnId}`);
      return;
    }
    navigate(moneyTypeMeta[txnType].path);
  };

  const isValid = useMemo(() => {
    if (!txnType) return false;
    if (!form.txnDate || !Number(form.amount)) return false;
    if (txnType === 'check' || txnType === 'expense') {
      return Boolean(form.bankAccountId && form.categoryAccountId);
    }
    if (txnType === 'deposit') {
      return Boolean(form.bankAccountId && form.categoryAccountId);
    }
    return Boolean(form.fromAccountId && form.toAccountId);
  }, [form, txnType]);

  const bankAccounts = useMemo(() => {
    const filtered = accounts.filter(isBankLikeAccount);
    return filtered.length > 0 ? filtered : accounts;
  }, [accounts]);

  const categoryAccounts = useMemo(() => {
    const filtered = accounts.filter((account) => !isBankLikeAccount(account));
    return filtered.length > 0 ? filtered : accounts;
  }, [accounts]);

  const amountValue = Number(form.amount || 0);
  const bankAccount = selectedAccount(accounts, form.bankAccountId);
  const categoryAccount = selectedAccount(accounts, form.categoryAccountId);
  const fromAccount = selectedAccount(accounts, form.fromAccountId);
  const toAccount = selectedAccount(accounts, form.toAccountId);
  const vendor = selectedVendor(vendors, form.payeeRefId);

  const previewRows = useMemo(() => {
    if (!txnType) return [];
    if (txnType === 'check' || txnType === 'expense') {
      return [
        ['Money out of', bankAccount?.name ?? '-'],
        ['Category', categoryAccount?.name ?? '-'],
        ['Payee', vendor?.displayName ?? '-'],
        ['Amount', formatCurrency(amountValue || null)]
      ];
    }
    if (txnType === 'deposit') {
      return [
        ['Deposit to', bankAccount?.name ?? '-'],
        ['Source category', categoryAccount?.name ?? '-'],
        ['Amount', formatCurrency(amountValue || null)]
      ];
    }
    return [
      ['From account', fromAccount?.name ?? '-'],
      ['To account', toAccount?.name ?? '-'],
      ['Amount', formatCurrency(amountValue || null)]
    ];
  }, [amountValue, bankAccount?.name, categoryAccount?.name, fromAccount?.name, toAccount?.name, txnType, vendor?.displayName]);

  const renderAccountOptions = (options: AccountOption[]) =>
    options.map((account) => (
      <MenuItem key={account.qbId} value={account.qbId}>
        {account.name}
      </MenuItem>
    ));

  if (!canView || !canPost) {
    return <NoAccess />;
  }

  if (!txnType || (mode === 'edit' && !qbTxnId)) {
    return <Navigate to="/404" replace />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={mode === 'create' ? moneyTypeMeta[txnType].createLabel : `Edit ${moneyTypeMeta[txnType].label.slice(0, -1)}`}
        subtitle={moneyTypeMeta[txnType].subtitle}
        icon={<AccountBalanceWalletOutlinedIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        {error ? <Alert severity="error">{error}</Alert> : null}
        {loading ? <Alert severity="info">Loading transaction...</Alert> : null}
        {!loading ? (
          <Paper sx={{ p: { xs: 2, md: 3 } }}>
            <Stack spacing={3}>
              <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' } }}>
                <Stack spacing={2.5}>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                      <Typography variant="h6">Main Information</Typography>
                      <Chip size="small" label={moneyTypeMeta[txnType].label.slice(0, -1)} />
                    </Stack>
                    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                      <TextField
                        label="Date"
                        type="date"
                        value={form.txnDate}
                        onChange={(event) => setForm((current) => ({ ...current, txnDate: event.target.value }))}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                      />
                      <TextField
                        label="Amount"
                        type="number"
                        inputProps={{ min: 0, step: '0.01' }}
                        value={form.amount}
                        onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                        fullWidth
                      />
                    </Box>
                  </Box>

                  {(txnType === 'check' || txnType === 'expense' || txnType === 'deposit') ? (
                    <Box>
                      <Typography variant="h6" sx={{ mb: 1.5 }}>
                        Money Movement
                      </Typography>
                      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                        <TextField
                          select
                          label={txnType === 'deposit' ? 'Deposit Account' : 'Bank Account'}
                          value={form.bankAccountId}
                          onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))}
                          helperText={accountDescriptor(bankAccount)}
                          fullWidth
                        >
                          {renderAccountOptions(bankAccounts)}
                        </TextField>
                        <TextField
                          select
                          label="Category Account"
                          value={form.categoryAccountId}
                          onChange={(event) => setForm((current) => ({ ...current, categoryAccountId: event.target.value }))}
                          helperText={accountDescriptor(categoryAccount)}
                          fullWidth
                        >
                          {renderAccountOptions(categoryAccounts)}
                        </TextField>
                      </Box>
                    </Box>
                  ) : null}

                  {txnType === 'transfer' ? (
                    <Box>
                      <Typography variant="h6" sx={{ mb: 1.5 }}>
                        Transfer Accounts
                      </Typography>
                      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                        <TextField
                          select
                          label="From Account"
                          value={form.fromAccountId}
                          onChange={(event) => setForm((current) => ({ ...current, fromAccountId: event.target.value }))}
                          helperText={accountDescriptor(fromAccount)}
                          fullWidth
                        >
                          {renderAccountOptions(bankAccounts)}
                        </TextField>
                        <TextField
                          select
                          label="To Account"
                          value={form.toAccountId}
                          onChange={(event) => setForm((current) => ({ ...current, toAccountId: event.target.value }))}
                          helperText={accountDescriptor(toAccount)}
                          fullWidth
                        >
                          {renderAccountOptions(accounts)}
                        </TextField>
                      </Box>
                    </Box>
                  ) : null}

                  {(txnType === 'check' || txnType === 'expense') ? (
                    <Box>
                      <Typography variant="h6" sx={{ mb: 1.5 }}>
                        Payee
                      </Typography>
                      <TextField
                        select
                        label="Vendor"
                        value={form.payeeRefId}
                        onChange={(event) => setForm((current) => ({ ...current, payeeRefId: event.target.value }))}
                        helperText={vendor ? 'Active QuickBooks vendor' : 'Optional'}
                        fullWidth
                      >
                        <MenuItem value="">None</MenuItem>
                        {vendors.map((vendor) => (
                          <MenuItem key={vendor.qbId} value={vendor.qbId}>
                            {vendor.displayName}
                          </MenuItem>
                        ))}
                      </TextField>
                    </Box>
                  ) : null}

                  <Box>
                    <Typography variant="h6" sx={{ mb: 1.5 }}>
                      Notes
                    </Typography>
                    <TextField
                      label="Memo"
                      value={form.memo}
                      onChange={(event) => setForm((current) => ({ ...current, memo: event.target.value }))}
                      multiline
                      minRows={3}
                      fullWidth
                    />
                  </Box>
                </Stack>

                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    alignSelf: 'start',
                    position: { lg: 'sticky' },
                    top: { lg: 16 }
                  }}
                >
                  <Stack spacing={1.5}>
                    <Typography variant="h6">Review</Typography>
                    <Divider />
                    {previewRows.map(([label, value]) => (
                      <Stack key={label} spacing={0.25}>
                        <Typography variant="caption" color="text.secondary">
                          {label}
                        </Typography>
                        <Typography variant="body2" fontWeight={600}>
                          {value}
                        </Typography>
                      </Stack>
                    ))}
                    {form.memo.trim() ? (
                      <Stack spacing={0.25}>
                        <Typography variant="caption" color="text.secondary">
                          Memo
                        </Typography>
                        <Typography variant="body2">{form.memo.trim()}</Typography>
                      </Stack>
                    ) : null}
                  </Stack>
                </Box>
              </Box>

              <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
                <Button variant="outlined" onClick={onCancel} disabled={saving}>
                  Cancel
                </Button>
                <Button variant="contained" onClick={() => void onSubmit()} disabled={!isValid || saving}>
                  {saving ? 'Saving...' : mode === 'create' ? moneyTypeMeta[txnType].createLabel : 'Save'}
                </Button>
              </Stack>
            </Stack>
          </Paper>
        ) : null}
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export const QuickBooksMoneyCreatePage = () => <QuickBooksMoneyEditorPage mode="create" />;
export const QuickBooksMoneyEditPage = () => <QuickBooksMoneyEditorPage mode="edit" />;
