import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid2 as Grid,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import { BankStatementStatus } from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';
import {
  StatementMonthCalendar,
  type StatementMonthInfo,
  StatementWorkflowCard,
  UploadStatementDialog,
  type UploadStatementResult
} from '../components';
import {
  readDefaultStatementBankAccountId,
  writeDefaultStatementBankAccountId
} from '../constants/statementBankAccount';
import { formatStatementMonthShort } from '../utils/statementDisplay';
import { isStatementInFlight } from '../utils/statementStatus';

type StatementItem = {
  id: string;
  statementMonth: string;
  fileName: string;
  bankAccountId?: string;
  status: BankStatementStatus;
  progress: {
    phase: BankStatementStatus;
    totalChecks: number;
    checksQueued: number;
    checksProcessing: number;
    checksReady: number;
    checksFailed: number;
    completedChecks: number;
    remainingChecks: number;
  };
  issuesCount: number;
  updatedAt: string;
};

type BankChartAccountOption = {
  id: string;
  qbId: string;
  name: string;
  detailType?: string;
};

type StatementsLocationState = {
  refreshStatementsAt?: number;
};

export const StatementsPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'bankStatements', 'view');
  const canCreate = hasPermission(permissions, 'bankStatements', 'create');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');
  const canDelete = hasPermission(permissions, 'bankStatements', 'delete');
  const canViewQuickBooks = hasPermission(permissions, 'quickbooks', 'view');

  const { isConnected: quickBooksConnected } = useQuickBooksWorkspace(canViewQuickBooks);

  const [rows, setRows] = useState<StatementItem[]>([]);
  const [monthInfos, setMonthInfos] = useState<StatementMonthInfo[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankChartAccountOption[]>([]);
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(() =>
    readDefaultStatementBankAccountId()
  );
  const [filterMonth, setFilterMonth] = useState('');
  const [calendarYear, setCalendarYear] = useState(() => new Date().getUTCFullYear());
  const [loading, setLoading] = useState(true);
  const [loadingBankAccounts, setLoadingBankAccounts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bankAccountError, setBankAccountError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountNumber, setNewAccountNumber] = useState('');
  const [newAccountDetailType, setNewAccountDetailType] = useState<'Checking' | 'Savings' | 'CashOnHand'>(
    'Checking'
  );
  const hasAssignedBankAccount = Boolean(selectedBankAccountId);
  const needsQuickBooksConnection = canViewQuickBooks && !quickBooksConnected;
  const workspaceReady = hasAssignedBankAccount && !needsQuickBooksConnection;

  const goToQuickBooksSettings = useCallback(() => {
    navigate('/dashboard/settings?open=quickbooks');
  }, [navigate]);

  const load = useCallback(
    async (options?: { month?: string }) => {
      if (!canView || !workspaceReady) return;
      const monthFilter = options?.month !== undefined ? options.month : filterMonth;
      setLoading(true);
      setError(null);
      try {
        const [listResponse, monthsResponse] = await Promise.all([
          accountingApi.listStatements({
            month: monthFilter || undefined,
            bankAccountId: selectedBankAccountId || undefined
          }),
          accountingApi.listStatementMonths({
            bankAccountId: selectedBankAccountId || undefined
          })
        ]);
        setRows(listResponse.data.data.statements);
        setMonthInfos(monthsResponse.data.data.months as StatementMonthInfo[]);
      } catch (loadError) {
        setError(extractApiErrorMessage(loadError, 'Failed to load statements'));
      } finally {
        setLoading(false);
      }
    },
    [canView, filterMonth, selectedBankAccountId, workspaceReady]
  );

  useEffect(() => {
    if (!workspaceReady) return;
    setFilterMonth('');
  }, [selectedBankAccountId, workspaceReady]);

  const loadBankAccounts = useCallback(async () => {
    if (!canView || !canViewQuickBooks || !quickBooksConnected) {
      setBankAccounts([]);
      setLoadingBankAccounts(false);
      return;
    }
    setLoadingBankAccounts(true);
    setBankAccountError(null);
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        page: 1,
        pageSize: 100,
        status: 'active',
        accountKind: 'bank',
        sort: 'name'
      });
      const items = response.data.data.items ?? [];
      const options = items
        .filter((item) => item.qbId && item.name)
        .map((item) => ({
          id: item.id,
          qbId: String(item.qbId),
          name: String(item.name),
          detailType: item.detailType ?? undefined
        }));
      setBankAccounts(options);
      if (options.every((option) => option.qbId !== selectedBankAccountId)) {
        setSelectedBankAccountId('');
        writeDefaultStatementBankAccountId('');
      }
    } catch (apiError) {
      setBankAccountError(extractApiErrorMessage(apiError, 'Failed to load bank chart accounts'));
      setBankAccounts([]);
    } finally {
      setLoadingBankAccounts(false);
    }
  }, [canView, canViewQuickBooks, quickBooksConnected, selectedBankAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refreshAt = (location.state as StatementsLocationState | null)?.refreshStatementsAt;
    if (!refreshAt) return;
    void load();
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, load, navigate]);

  useEffect(() => {
    void loadBankAccounts();
  }, [loadBankAccounts]);

  useEffect(() => {
    if (quickBooksConnected) return;
    if (!selectedBankAccountId) return;
    setSelectedBankAccountId('');
    writeDefaultStatementBankAccountId('');
  }, [quickBooksConnected, selectedBankAccountId]);

  useEffect(() => {
    writeDefaultStatementBankAccountId(selectedBankAccountId);
  }, [selectedBankAccountId]);

  const bankScopedRows = useMemo(() => {
    if (!selectedBankAccountId) return rows;
    const selectedAccount = bankAccounts.find((account) => account.qbId === selectedBankAccountId);
    const allowedRefs = new Set(
      [selectedBankAccountId, selectedAccount?.id, selectedAccount?.qbId].filter(Boolean) as string[]
    );
    return rows.filter((row) => row.bankAccountId && allowedRefs.has(row.bankAccountId));
  }, [bankAccounts, rows, selectedBankAccountId]);

  const hasInFlightRows = useMemo(
    () => bankScopedRows.some((row) => isStatementInFlight(row.status)),
    [bankScopedRows]
  );

  useEffect(() => {
    if (!canView || !workspaceReady) return;
    if (!hasInFlightRows && !uploadOpen) return;

    const intervalMs = uploadOpen ? 2000 : 4000;
    const timer = window.setInterval(() => {
      void load();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [canView, workspaceReady, hasInFlightRows, uploadOpen, load]);

  const reprocess = async (id: string) => {
    try {
      await accountingApi.reprocessStatement(id);
      dispatch(showSnackbar({ message: 'Reprocess started', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to reprocess statement'),
          severity: 'error'
        })
      );
    }
  };

  const deleteStatement = async (id: string, statementMonth: string) => {
    const confirmed = window.confirm(
      `Delete the ${formatStatementMonthShort(statementMonth)} statement? This removes the statement and its extracted processing records.`
    );
    if (!confirmed) return;

    try {
      await accountingApi.deleteStatement(id);
      dispatch(showSnackbar({ message: 'Statement deleted', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to delete statement'),
          severity: 'error'
        })
      );
    }
  };

  const onUploaded = async (result: UploadStatementResult) => {
    if (result.statementMonth) {
      setFilterMonth(result.statementMonth);
    }
    dispatch(
      showSnackbar({
        message: 'Statement uploaded and processing started',
        severity: 'success'
      })
    );
    await load({ month: result.statementMonth || filterMonth });
  };

  const createBankAccount = async () => {
    if (!newAccountName.trim()) {
      dispatch(showSnackbar({ message: 'Account name is required', severity: 'error' }));
      return;
    }
    setCreatingAccount(true);
    try {
      const response = await accountingApi.createQuickbooksHubChartAccount({
        accountKind: 'bank',
        name: newAccountName.trim(),
        accountNumber: newAccountNumber.trim() || undefined,
        detailType: newAccountDetailType
      });
      const created = response.data.data.account;
      await loadBankAccounts();
      if (created.qbId) {
        const qbId = String(created.qbId);
        setSelectedBankAccountId(qbId);
        writeDefaultStatementBankAccountId(qbId);
      }
      setCreateAccountOpen(false);
      setNewAccountName('');
      setNewAccountNumber('');
      setNewAccountDetailType('Checking');
      dispatch(showSnackbar({ message: 'Bank chart account created', severity: 'success' }));
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to create bank chart account'),
          severity: 'error'
        })
      );
    } finally {
      setCreatingAccount(false);
    }
  };

  const hasRows = useMemo(() => bankScopedRows.length > 0, [bankScopedRows]);

  const sections = useMemo(
    () => [
      {
        title: 'Queued',
        subtitle: 'Waiting to start extraction.',
        rows: bankScopedRows.filter((row) => row.status === 'uploaded')
      },
      {
        title: 'Running',
        subtitle: 'Extraction, structuring, or checks in progress.',
        rows: bankScopedRows.filter((row) =>
          row.status === 'extracting' || row.status === 'structuring' || row.status === 'checks_queued'
        )
      },
      {
        title: 'Attention',
        subtitle: 'Failed or needs reprocess.',
        rows: bankScopedRows.filter((row) => row.status === 'failed')
      },
      {
        title: 'Ready',
        subtitle: 'Workspace review available.',
        rows: bankScopedRows.filter((row) => row.status === 'ready_for_review')
      }
    ],
    [bankScopedRows]
  );

  const sectionsWithRows = useMemo(
    () => sections.filter((section) => section.rows.length > 0),
    [sections]
  );
  const selectedBankAccountValue = bankAccounts.some((account) => account.qbId === selectedBankAccountId)
    ? selectedBankAccountId
    : '';
  const workspaceBlockedMessage = useMemo(() => {
    if (workspaceReady) return null;
    if (needsQuickBooksConnection) {
      return 'Connect QuickBooks in Settings to use bank statements.';
    }
    if (!canViewQuickBooks) {
      return 'QuickBooks account access is required to assign a bank chart account before using statements.';
    }
    if (!quickBooksConnected) {
      return 'Connect QuickBooks first, then assign a bank chart account to continue.';
    }
    if (!loadingBankAccounts && bankAccounts.length === 0) {
      return 'No active bank chart accounts found. Create one to continue.';
    }
    return 'Select a bank chart account to unlock statement upload and workspace visibility.';
  }, [
    workspaceReady,
    needsQuickBooksConnection,
    canViewQuickBooks,
    quickBooksConnected,
    loadingBankAccounts,
    bankAccounts.length
  ]);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={(
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Typography variant="h5">Bank Statements</Typography>
            <TextField
              select
              size="small"
              label="Bank chart account"
              value={selectedBankAccountValue}
              onChange={(event) => setSelectedBankAccountId(event.target.value)}
              disabled={!canViewQuickBooks || !quickBooksConnected || loadingBankAccounts || bankAccounts.length === 0}
              sx={{ minWidth: { xs: 260, md: 340 } }}
            >
              <MenuItem value="">
                <em>Select bank account</em>
              </MenuItem>
              {bankAccounts.map((account) => (
                <MenuItem key={account.qbId} value={account.qbId}>
                  {account.name}
                  {account.detailType ? ` (${account.detailType})` : ''}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              onClick={() => setCreateAccountOpen(true)}
              disabled={!canViewQuickBooks || !quickBooksConnected}
            >
              Create account
            </Button>
          </Stack>
        )}
        icon={<AccountBalanceIcon />}
      />
      {error && <Alert severity="error">{error}</Alert>}
      {bankAccountError && <Alert severity="error">{bankAccountError}</Alert>}
      {workspaceBlockedMessage ? (
        <Alert
          severity="warning"
          action={
            needsQuickBooksConnection ? (
              <Button color="inherit" size="small" onClick={goToQuickBooksSettings}>
                Go to Settings
              </Button>
            ) : undefined
          }
        >
          {workspaceBlockedMessage}
        </Alert>
      ) : null}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }} order={{ xs: 2, lg: 1 }}>
          {!workspaceReady ? (
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.5} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">
                  {workspaceBlockedMessage ??
                    'Statement workspace is locked until QuickBooks is connected and a bank chart account is selected.'}
                </Typography>
                {needsQuickBooksConnection ? (
                  <Button variant="contained" size="small" onClick={goToQuickBooksSettings}>
                    Go to Settings
                  </Button>
                ) : null}
              </Stack>
            </Paper>
          ) : (
            <LoadingEmptyStateWrapper
              loading={loading}
              empty={!loading && !hasRows}
              loadingLabel="Loading statements..."
              emptyMessage={filterMonth ? 'No statements for this month' : 'No statements yet'}
              emptySecondary={
                filterMonth
                  ? 'Try another month on the calendar or clear the month filter.'
                  : 'Upload a PDF to get started.'
              }
            >
              <Stack spacing={2}>
                {sectionsWithRows.map((section) => (
                  <Paper key={section.title} sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle1">{section.title}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {section.subtitle}
                        </Typography>
                      </Stack>

                      <Stack spacing={1.25}>
                        {section.rows.map((row) => (
                          <StatementWorkflowCard
                            key={row.id}
                            row={row}
                            canEdit={canEdit}
                            canDelete={canDelete}
                            onOpenWorkspace={() => navigate(`/dashboard/accounting/statements/${row.id}`)}
                            onReprocess={() => void reprocess(row.id)}
                            onDelete={() => void deleteStatement(row.id, row.statementMonth)}
                          />
                        ))}
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </LoadingEmptyStateWrapper>
          )}
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }} order={{ xs: 1, lg: 2 }}>
          <Stack spacing={2}>
            <StatementMonthCalendar
              months={monthInfos}
              selectedMonth={filterMonth}
              onSelectMonth={setFilterMonth}
              year={calendarYear}
              onYearChange={setCalendarYear}
            />
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  <Button variant="outlined" onClick={() => void load()} disabled={!workspaceReady}>
                    Refresh
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => setUploadOpen(true)}
                    disabled={!canCreate || !workspaceReady}
                  >
                    Upload PDF
                  </Button>
                </Stack>
              </Stack>
            </Paper>
          </Stack>
        </Grid>
      </Grid>

      <UploadStatementDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={onUploaded}
        defaultBankAccountId={selectedBankAccountId}
        onSaveError={(message) => {
          dispatch(showSnackbar({ message, severity: 'error' }));
        }}
      />

      <Dialog open={createAccountOpen} onClose={() => (creatingAccount ? null : setCreateAccountOpen(false))} fullWidth maxWidth="sm">
        <DialogTitle>Create bank chart account</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Account name"
              value={newAccountName}
              onChange={(event) => setNewAccountName(event.target.value)}
              required
              autoFocus
              size="small"
            />
            <TextField
              label="Account number (optional)"
              value={newAccountNumber}
              onChange={(event) => setNewAccountNumber(event.target.value)}
              size="small"
            />
            <TextField
              select
              label="Detail type"
              value={newAccountDetailType}
              onChange={(event) =>
                setNewAccountDetailType(event.target.value as 'Checking' | 'Savings' | 'CashOnHand')
              }
              size="small"
            >
              <MenuItem value="Checking">Checking</MenuItem>
              <MenuItem value="Savings">Savings</MenuItem>
              <MenuItem value="CashOnHand">Cash on hand</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateAccountOpen(false)} disabled={creatingAccount}>
            Cancel
          </Button>
          <Button onClick={() => void createBankAccount()} variant="contained" disabled={creatingAccount}>
            {creatingAccount ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};

export default StatementsPage;
