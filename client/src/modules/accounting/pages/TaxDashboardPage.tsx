import {
  Alert,
  Button,
  Grid,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { NoAccess, PageHeader } from '../../../components';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

const defaultWindow = () => {
  const now = new Date();
  const from = `${now.getUTCFullYear()}-01-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

const formatCurrency = (value: number | null | undefined) =>
  value == null || Number.isNaN(value) ? '-' : currencyFormatter.format(value);

type SectionState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

type JournalLine = {
  accountId: string;
  debit: string;
  credit: string;
  description: string;
};

export const TaxDashboardPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canPost = hasPermission(permissions, 'quickbooks', 'actions:post');
  const { loading: workspaceLoading, isConnected, error: workspaceError } = useQuickBooksWorkspace(canView);

  const dateWindow = useMemo(defaultWindow, []);
  const [from, setFrom] = useState(dateWindow.from);
  const [to, setTo] = useState(dateWindow.to);
  const [paymentFilter, setPaymentFilter] = useState<'customer' | 'vendor' | 'all'>('all');

  const [accounts, setAccounts] = useState<SectionState<any[]>>({
    loading: false,
    error: null,
    data: null
  });
  const [payments, setPayments] = useState<SectionState<any>>({
    loading: false,
    error: null,
    data: null
  });

  const [recoverForm, setRecoverForm] = useState({
    clientRequestId: '',
    paymentType: 'customer' as 'customer' | 'vendor',
    txnDate: to,
    amount: '',
    bankAccountId: '',
    customerId: '',
    vendorId: '',
    categoryAccountId: '',
    memo: ''
  });
  const [journalForm, setJournalForm] = useState({
    clientRequestId: '',
    txnDate: to,
    memo: '',
    lines: [
      { accountId: '', debit: '', credit: '', description: '' },
      { accountId: '', debit: '', credit: '', description: '' }
    ] as JournalLine[]
  });
  const [postingBusy, setPostingBusy] = useState(false);

  const loadAccounts = useCallback(async () => {
    setAccounts((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await accountingApi.getQuickbooksTaxChartOfAccounts();
      setAccounts({ loading: false, error: null, data: response.data.data });
    } catch (apiError) {
      setAccounts({
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load chart of accounts'),
        data: null
      });
    }
  }, []);

  const loadPayments = useCallback(async () => {
    setPayments((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await accountingApi.getQuickbooksTaxPayments({
        from,
        to,
        type: paymentFilter,
        limit: 100
      });
      setPayments({ loading: false, error: null, data: response.data.data });
    } catch (apiError) {
      setPayments({
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load payments'),
        data: null
      });
    }
  }, [from, paymentFilter, to]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadAccounts(), loadPayments()]);
  }, [loadAccounts, loadPayments]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void refreshAll();
  }, [canView, isConnected, refreshAll]);

  const submitRecoverPayment = async () => {
    if (!canPost) return;
    setPostingBusy(true);
    try {
      const payload = {
        clientRequestId: recoverForm.clientRequestId.trim(),
        paymentType: recoverForm.paymentType,
        txnDate: recoverForm.txnDate,
        amount: Number(recoverForm.amount),
        bankAccountId: recoverForm.bankAccountId.trim(),
        customerId: recoverForm.customerId.trim() || undefined,
        vendorId: recoverForm.vendorId.trim() || undefined,
        categoryAccountId: recoverForm.categoryAccountId.trim() || undefined,
        memo: recoverForm.memo.trim() || undefined
      };
      const response = await accountingApi.recoverQuickbooksPayment(payload);
      dispatch(
        showSnackbar({
          message: response.data.data.created
            ? 'QuickBooks payment created.'
            : 'QuickBooks payment already existed (idempotent).',
          severity: 'success'
        })
      );
      await loadPayments();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to recover payment'),
          severity: 'error'
        })
      );
    } finally {
      setPostingBusy(false);
    }
  };

  const submitJournalAdjustment = async () => {
    if (!canPost) return;
    setPostingBusy(true);
    try {
      const payload = {
        clientRequestId: journalForm.clientRequestId.trim(),
        txnDate: journalForm.txnDate,
        memo: journalForm.memo.trim() || undefined,
        lines: journalForm.lines.map((line) => ({
          accountId: line.accountId.trim(),
          debit: line.debit.trim() ? Number(line.debit) : undefined,
          credit: line.credit.trim() ? Number(line.credit) : undefined,
          description: line.description.trim() || undefined
        }))
      };
      const response = await accountingApi.createQuickbooksJournalAdjustment(payload);
      dispatch(
        showSnackbar({
          message: response.data.data.created
            ? 'Journal adjustment created.'
            : 'Journal adjustment already existed (idempotent).',
          severity: 'success'
        })
      );
      await loadPayments();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to create journal adjustment'),
          severity: 'error'
        })
      );
    } finally {
      setPostingBusy(false);
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Tax"
        subtitle="Run payment recovery and journal adjustments against the connected QuickBooks company."
        icon={<ReceiptLongIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection loading={workspaceLoading} isConnected={isConnected} error={workspaceError}>
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField
              size="small"
              type="date"
              label="From"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              select
              label="Payments"
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as 'customer' | 'vendor' | 'all')
              }
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="customer">Customer</MenuItem>
              <MenuItem value="vendor">Vendor</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={() => void refreshAll()}>
              Refresh Tax Tools
            </Button>
          </Stack>
        </Paper>

        <Grid container spacing={2}>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                QuickBooks Payments
              </Typography>
              {payments.error ? <Alert severity="error">{payments.error}</Alert> : null}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Entity</TableCell>
                    <TableCell>Memo</TableCell>
                    <TableCell align="right">Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(payments.data?.payments ?? []).map((payment: any) => (
                    <TableRow key={`${payment.paymentType}-${payment.id}`}>
                      <TableCell>{payment.txnDate}</TableCell>
                      <TableCell>{payment.paymentType}</TableCell>
                      <TableCell>{payment.entityName ?? payment.entityId ?? '-'}</TableCell>
                      <TableCell>{payment.memo ?? '-'}</TableCell>
                      <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 2, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Chart of Accounts Reference
              </Typography>
              {accounts.error ? <Alert severity="error">{accounts.error}</Alert> : null}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(accounts.data ?? []).slice(0, 100).map((account: any) => (
                    <TableRow key={account.id}>
                      <TableCell>{account.code ?? '-'}</TableCell>
                      <TableCell>{account.name}</TableCell>
                      <TableCell>{account.accountType ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Recover Payment
              </Typography>
              {!canPost ? (
                <Alert severity="info" sx={{ mb: 1 }}>
                  Missing `quickbooks:post` permission.
                </Alert>
              ) : null}
              <Stack spacing={1}>
                <TextField
                  size="small"
                  label="Client Request ID"
                  value={recoverForm.clientRequestId}
                  onChange={(event) =>
                    setRecoverForm((prev) => ({ ...prev, clientRequestId: event.target.value }))
                  }
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    select
                    label="Payment Type"
                    value={recoverForm.paymentType}
                    onChange={(event) =>
                      setRecoverForm((prev) => ({
                        ...prev,
                        paymentType: event.target.value as 'customer' | 'vendor'
                      }))
                    }
                    sx={{ minWidth: 180 }}
                  >
                    <MenuItem value="customer">Customer</MenuItem>
                    <MenuItem value="vendor">Vendor</MenuItem>
                  </TextField>
                  <TextField
                    size="small"
                    type="date"
                    label="Txn Date"
                    value={recoverForm.txnDate}
                    onChange={(event) =>
                      setRecoverForm((prev) => ({ ...prev, txnDate: event.target.value }))
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    label="Amount"
                    type="number"
                    value={recoverForm.amount}
                    onChange={(event) =>
                      setRecoverForm((prev) => ({ ...prev, amount: event.target.value }))
                    }
                  />
                  <TextField
                    size="small"
                    label="Bank Account ID"
                    value={recoverForm.bankAccountId}
                    onChange={(event) =>
                      setRecoverForm((prev) => ({ ...prev, bankAccountId: event.target.value }))
                    }
                  />
                </Stack>
                {recoverForm.paymentType === 'customer' ? (
                  <TextField
                    size="small"
                    label="Customer ID"
                    value={recoverForm.customerId}
                    onChange={(event) =>
                      setRecoverForm((prev) => ({ ...prev, customerId: event.target.value }))
                    }
                  />
                ) : (
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      size="small"
                      label="Vendor ID"
                      value={recoverForm.vendorId}
                      onChange={(event) =>
                        setRecoverForm((prev) => ({ ...prev, vendorId: event.target.value }))
                      }
                    />
                    <TextField
                      size="small"
                      label="Category Account ID"
                      value={recoverForm.categoryAccountId}
                      onChange={(event) =>
                        setRecoverForm((prev) => ({
                          ...prev,
                          categoryAccountId: event.target.value
                        }))
                      }
                    />
                  </Stack>
                )}
                <TextField
                  size="small"
                  label="Memo"
                  value={recoverForm.memo}
                  onChange={(event) =>
                    setRecoverForm((prev) => ({ ...prev, memo: event.target.value }))
                  }
                />
                <Button variant="contained" disabled={!canPost || postingBusy} onClick={() => void submitRecoverPayment()}>
                  Recover Payment
                </Button>
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Journal Adjustment
              </Typography>
              {!canPost ? (
                <Alert severity="info" sx={{ mb: 1 }}>
                  Missing `quickbooks:post` permission.
                </Alert>
              ) : null}
              <Stack spacing={1}>
                <TextField
                  size="small"
                  label="Client Request ID"
                  value={journalForm.clientRequestId}
                  onChange={(event) =>
                    setJournalForm((prev) => ({ ...prev, clientRequestId: event.target.value }))
                  }
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    size="small"
                    type="date"
                    label="Txn Date"
                    value={journalForm.txnDate}
                    onChange={(event) =>
                      setJournalForm((prev) => ({ ...prev, txnDate: event.target.value }))
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    label="Memo"
                    value={journalForm.memo}
                    onChange={(event) =>
                      setJournalForm((prev) => ({ ...prev, memo: event.target.value }))
                    }
                  />
                </Stack>
                {journalForm.lines.map((line, index) => (
                  <Stack key={index} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      size="small"
                      label={`Line ${index + 1} Account`}
                      value={line.accountId}
                      onChange={(event) =>
                        setJournalForm((prev) => {
                          const next = [...prev.lines];
                          next[index] = { ...next[index], accountId: event.target.value };
                          return { ...prev, lines: next };
                        })
                      }
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Debit"
                      value={line.debit}
                      onChange={(event) =>
                        setJournalForm((prev) => {
                          const next = [...prev.lines];
                          next[index] = { ...next[index], debit: event.target.value };
                          return { ...prev, lines: next };
                        })
                      }
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Credit"
                      value={line.credit}
                      onChange={(event) =>
                        setJournalForm((prev) => {
                          const next = [...prev.lines];
                          next[index] = { ...next[index], credit: event.target.value };
                          return { ...prev, lines: next };
                        })
                      }
                    />
                  </Stack>
                ))}
                <Button variant="contained" disabled={!canPost || postingBusy} onClick={() => void submitJournalAdjustment()}>
                  Post Journal Adjustment
                </Button>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default TaxDashboardPage;
