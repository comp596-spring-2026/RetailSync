import {
  Alert,
  Button,
  Chip,
  Grid2 as Grid,
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
import DescriptionIcon from '@mui/icons-material/Description';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { formatDate } from '../../../utils/date';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { AccountingTabs } from '../components';

const CATEGORY_OPTIONS = [
  'expense',
  'income',
  'inventory',
  'payroll',
  'utilities',
  'rent',
  'fees',
  'transfer',
  'other'
];

type StatementDetail = {
  id: string;
  statementMonth: string;
  fileName: string;
  status: string;
  processingStage?: string;
  updatedAt: string;
  pages: Array<{ pageNo: number; gcsPath: string }>;
  checks: Array<{ checkId: string; pageNo: number; gcsPath: string }>;
  extraction?: {
    rawOcrText?: string;
    structuredJson?: {
      summary?: {
        openingBalance?: number;
        closingBalance?: number;
      };
      transactions?: Array<{
        id: string;
        date: string;
        description: string;
        amount: number;
        type: string;
        suggestedCategory?: string;
      }>;
    };
    issues: string[];
  };
};

export const StatementDetailPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'accounting', 'view') || hasPermission(permissions, 'bankStatements', 'view');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');
  const canConfirm = hasPermission(permissions, 'bankStatements', 'actions:confirm');
  const canLock = hasPermission(permissions, 'bankStatements', 'actions:lock');

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [draftCategories, setDraftCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!statementId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getStatement(statementId);
      const detail = response.data.data as StatementDetail;
      setStatement(detail);
      const mapped = (detail.extraction?.structuredJson?.transactions ?? []).reduce<Record<string, string>>((acc, txn) => {
        if (txn.suggestedCategory) {
          acc[txn.id] = txn.suggestedCategory;
        }
        return acc;
      }, {});
      setDraftCategories(mapped);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load statement'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, statementId]);

  const transactions = useMemo(() => statement?.extraction?.structuredJson?.transactions ?? [], [statement]);
  const missingCategoriesCount = useMemo(
    () =>
      transactions.filter((txn) => !(draftCategories[txn.id] || txn.suggestedCategory || '').trim()).length,
    [transactions, draftCategories]
  );
  const hasDraftChanges = useMemo(
    () =>
      transactions.some((txn) => {
        const nextValue = (draftCategories[txn.id] ?? txn.suggestedCategory ?? '').trim();
        const currentValue = (txn.suggestedCategory ?? '').trim();
        return nextValue !== currentValue;
      }),
    [transactions, draftCategories]
  );

  const reprocess = async () => {
    if (!statementId) return;
    try {
      await accountingApi.reprocessStatement(statementId);
      dispatch(showSnackbar({ message: 'Reprocess started', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to reprocess statement'), severity: 'error' }));
    }
  };

  const confirm = async () => {
    if (!statementId) return;
    if (missingCategoriesCount > 0) {
      dispatch(showSnackbar({ message: 'Assign categories to all transactions before confirming', severity: 'warning' }));
      return;
    }
    try {
      await accountingApi.confirmStatement(statementId);
      dispatch(showSnackbar({ message: 'Statement confirmed', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to confirm statement'), severity: 'error' }));
    }
  };

  const saveTransactionCategories = async () => {
    if (!statementId) return;
    if (!hasDraftChanges) return;
    setSaving(true);
    try {
      const payload = {
        transactions: transactions
          .map((txn) => ({
            id: txn.id,
            suggestedCategory: (draftCategories[txn.id] ?? txn.suggestedCategory ?? '').trim()
          }))
          .filter((txn) => txn.suggestedCategory.length > 0)
      };
      const response = await accountingApi.updateStatementTransactions(statementId, payload);
      setStatement(response.data.data.statement as StatementDetail);
      dispatch(showSnackbar({ message: 'Transaction categories saved', severity: 'success' }));
    } catch (apiError) {
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to save transaction categories'), severity: 'error' }));
    } finally {
      setSaving(false);
    }
  };

  const lock = async () => {
    if (!statementId) return;
    try {
      await accountingApi.lockStatement(statementId);
      dispatch(showSnackbar({ message: 'Statement locked', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to lock statement'), severity: 'error' }));
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`Statement Review${statement ? ` • ${statement.statementMonth}` : ''}`}
        subtitle="Validate extracted transactions before confirm and lock."
        icon={<DescriptionIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !statement}
        loadingLabel="Loading statement..."
        emptyMessage="Statement not found"
      >
        {statement && (
          <>
            <Paper sx={{ p: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ md: 'center' }}>
                <Stack>
                  <Typography variant="h6">{statement.fileName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Updated {formatDate(statement.updatedAt, 'short')}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Chip label={statement.status} color={statement.status === 'needs_review' ? 'warning' : 'default'} />
                  <Button variant="outlined" onClick={() => navigate('/dashboard/accounting/statements')}>
                    Back to list
                  </Button>
                  {canEdit && (
                    <Button variant="outlined" onClick={() => void reprocess()}>
                      Reprocess
                    </Button>
                  )}
                  {canConfirm && statement.status === 'needs_review' && (
                    <Button
                      variant="outlined"
                      onClick={() => void confirm()}
                      disabled={missingCategoriesCount > 0 || transactions.length === 0 || saving}
                    >
                      Confirm
                    </Button>
                  )}
                  {canLock && statement.status === 'confirmed' && (
                    <Button variant="outlined" color="warning" onClick={() => void lock()}>
                      Lock
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Paper>

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 5 }}>
                <Paper sx={{ p: 2, minHeight: 340 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Document Viewer
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    Page image rendering overlays are planned in Ticket 3.1.
                  </Typography>
                  <Stack spacing={1}>
                    {statement.pages.map((page) => (
                      <Paper key={page.pageNo} variant="outlined" sx={{ p: 1 }}>
                        <Typography variant="body2">Page {page.pageNo}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {page.gcsPath}
                        </Typography>
                      </Paper>
                    ))}
                    {statement.pages.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        No rendered pages yet.
                      </Typography>
                    )}
                  </Stack>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 7 }}>
                <Paper sx={{ p: 2, minHeight: 340 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle1">
                      Extracted Transactions
                    </Typography>
                    {canEdit && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => void saveTransactionCategories()}
                        disabled={!hasDraftChanges || saving}
                      >
                        {saving ? 'Saving...' : 'Save changes'}
                      </Button>
                    )}
                  </Stack>
                  {missingCategoriesCount > 0 && (
                    <Alert severity="warning" sx={{ mb: 1.5 }}>
                      {missingCategoriesCount} transaction(s) need a category before confirm.
                    </Alert>
                  )}
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Description</TableCell>
                        <TableCell align="right">Amount</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Category</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5}>
                            <Typography variant="body2" color="text.secondary">
                              No structured transactions yet.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map((txn) => (
                          <TableRow key={txn.id}>
                            <TableCell>{txn.date}</TableCell>
                            <TableCell>{txn.description}</TableCell>
                            <TableCell align="right">{txn.amount.toFixed(2)}</TableCell>
                            <TableCell>{txn.type}</TableCell>
                            <TableCell sx={{ minWidth: 160 }}>
                              <TextField
                                select
                                size="small"
                                fullWidth
                                value={draftCategories[txn.id] ?? txn.suggestedCategory ?? ''}
                                onChange={(event) =>
                                  setDraftCategories((prev) => ({
                                    ...prev,
                                    [txn.id]: event.target.value
                                  }))
                                }
                                disabled={!canEdit || statement.status === 'locked'}
                              >
                                <MenuItem value="">Select</MenuItem>
                                {CATEGORY_OPTIONS.map((category) => (
                                  <MenuItem key={category} value={category}>
                                    {category}
                                  </MenuItem>
                                ))}
                              </TextField>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </Paper>
              </Grid>
            </Grid>
          </>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};

export default StatementDetailPage;
