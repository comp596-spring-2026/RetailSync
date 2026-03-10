import {
  Alert,
  Button,
  Chip,
  Grid2 as Grid,
  Paper,
  Stack,
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

type CheckCard = {
  id: string;
  status: 'queued' | 'processing' | 'ready' | 'needs_review' | 'failed';
  confidence?: { overall: number };
  autoFill?: {
    checkNumber?: string;
    date?: string;
    payeeName?: string;
    amount?: number;
    memo?: string;
  };
  gcs: {
    frontPath: string;
    backPath?: string;
    ocrPath?: string;
    structuredPath?: string;
  };
  match?: {
    reasons?: string[];
    matchConfidence?: number;
  };
};

type StatementDetail = {
  id: string;
  statementMonth: string;
  fileName: string;
  status: string;
  progress: {
    totalChecks: number;
    checksQueued: number;
    checksProcessing: number;
    checksReady: number;
    checksFailed: number;
  };
  updatedAt: string;
  gcs: {
    rootPrefix: string;
    pdfPath: string;
  };
  issues: string[];
};

const statusColor = (status: CheckCard['status']) => {
  if (status === 'ready') return 'success';
  if (status === 'needs_review') return 'warning';
  if (status === 'failed') return 'error';
  if (status === 'processing') return 'info';
  return 'default';
};

export const StatementDetailPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView =
    hasPermission(permissions, 'accounting', 'view') ||
    hasPermission(permissions, 'bankStatements', 'view');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');

  const [statement, setStatement] = useState<StatementDetail | null>(null);
  const [checks, setChecks] = useState<CheckCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!statementId) return;
    setLoading(true);
    setError(null);
    try {
      const [statementResponse, checksResponse] = await Promise.all([
        accountingApi.getStatement(statementId),
        accountingApi.listStatementChecks(statementId)
      ]);
      setStatement(statementResponse.data.data as StatementDetail);
      setChecks(checksResponse.data.data.checks as CheckCard[]);
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

  useEffect(() => {
    if (!statementId || !canView || !statement) return;
    const inFlight =
      statement.status === 'extracting' ||
      statement.status === 'structuring' ||
      statement.status === 'checks_queued';
    if (!inFlight) return;

    const interval = window.setInterval(() => {
      void load();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [statementId, canView, statement]);

  const retryCheck = async (checkId: string) => {
    if (!statementId) return;
    try {
      await accountingApi.retryStatementCheck(statementId, checkId);
      dispatch(showSnackbar({ message: 'Check retry queued', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to retry check'),
          severity: 'error'
        })
      );
    }
  };

  const sortedChecks = useMemo(
    () =>
      [...checks].sort((a, b) => {
        const rank = (value: CheckCard['status']) => {
          if (value === 'processing') return 0;
          if (value === 'queued') return 1;
          if (value === 'needs_review') return 2;
          if (value === 'ready') return 3;
          return 4;
        };
        return rank(a.status) - rank(b.status);
      }),
    [checks]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`Statement Processing${statement ? ` • ${statement.statementMonth}` : ''}`}
        subtitle="Track check extraction progress and unlock review cards as they finish."
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
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ md: 'center' }}
              >
                <Stack>
                  <Typography variant="h6">{statement.fileName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Updated {formatDate(statement.updatedAt, 'short')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Status: {statement.status.replace(/_/g, ' ')}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/dashboard/accounting/statements')}
                  >
                    Back
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => navigate('/dashboard/accounting/ledger')}
                    disabled={statement.status !== 'ready_for_review'}
                  >
                    Open Ledger Review
                  </Button>
                </Stack>
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mt: 1.5 }}>
                <Typography variant="body2" color="text.secondary">
                  Checks total {statement.progress.totalChecks}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  queued {statement.progress.checksQueued}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  processing {statement.progress.checksProcessing}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  ready {statement.progress.checksReady}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  failed {statement.progress.checksFailed}
                </Typography>
              </Stack>
            </Paper>

            {statement.issues.length > 0 && (
              <Alert severity="warning">
                {statement.issues.join(' | ')}
              </Alert>
            )}

            <Grid container spacing={2}>
              {sortedChecks.map((check) => (
                <Grid key={check.id} size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography variant="subtitle2">Check {check.id.slice(-6)}</Typography>
                      <Chip
                        size="small"
                        color={statusColor(check.status) as any}
                        label={check.status.replace(/_/g, ' ')}
                      />
                    </Stack>

                    <Stack spacing={0.5} sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary">
                        Confidence: {check.confidence?.overall != null ? `${Math.round(check.confidence.overall * 100)}%` : 'n/a'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Check No: {check.autoFill?.checkNumber ?? '-'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Date: {check.autoFill?.date ?? '-'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Payee: {check.autoFill?.payeeName ?? '-'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Amount:{' '}
                        {typeof check.autoFill?.amount === 'number'
                          ? check.autoFill.amount.toFixed(2)
                          : '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Front: {check.gcs.frontPath}
                      </Typography>
                      {check.match?.reasons?.length ? (
                        <Typography variant="caption" color="text.secondary">
                          Why: {check.match.reasons.join(' • ')}
                        </Typography>
                      ) : null}
                    </Stack>

                    {canEdit && check.status === 'failed' && (
                      <Button
                        size="small"
                        variant="outlined"
                        sx={{ mt: 1.5 }}
                        onClick={() => void retryCheck(check.id)}
                      >
                        Retry
                      </Button>
                    )}
                  </Paper>
                </Grid>
              ))}

              {sortedChecks.length === 0 && (
                <Grid size={{ xs: 12 }}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      No check candidates detected yet.
                    </Typography>
                  </Paper>
                </Grid>
              )}
            </Grid>
          </>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};

export default StatementDetailPage;
