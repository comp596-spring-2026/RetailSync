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
import type { BankStatementDetail, StatementCheck } from '@retailsync/shared';
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

const statusColor = (status: StatementCheck['status']) => {
  if (status === 'ready') return 'success';
  if (status === 'needs_review') return 'warning';
  if (status === 'failed') return 'error';
  if (status === 'processing') return 'info';
  return 'default';
};

const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatMaybeDate = (value?: string | null) => {
  if (!value) return '-';
  return formatDate(value, 'short');
};

const formatProgressSummary = (progress: BankStatementDetail['progress']) =>
  `${progress.completedChecks} done • ${progress.remainingChecks} left`;

const getCheckSourceLabel = (check: StatementCheck) => {
  const source = check.extracted?.source;
  if (source) return source;
  if (check.autoFill) return 'legacy';
  return 'unknown';
};

const getCheckArtifactFlags = (check: StatementCheck) => {
  const flags: string[] = [];
  if (check.artifacts?.pageNumber != null) flags.push(`Page ${check.artifacts.pageNumber}`);
  if (check.artifacts?.cropImagePath) flags.push('Crop ready');
  if (check.artifacts?.ocrTextPath || check.artifacts?.ocrJsonPath) flags.push('OCR ready');
  if (check.gcs.structuredPath) flags.push('Structured ready');
  if (check.processing.retryCount > 0) flags.push(`Retries ${check.processing.retryCount}`);
  return flags;
};

const getProposalMode = (check: StatementCheck) => {
  if (!check.proposal?.qbTxnType) {
    return {
      label: 'No recommendation yet',
      color: 'default' as const,
      detail: 'The check has not been assigned a proposal yet.'
    };
  }

  if (check.ai?.source === 'fallback') {
    return {
      label: 'Deterministic fallback',
      color: 'warning' as const,
      detail: check.ai.degradedReason ?? 'Rules and historical matches were used without Gemini.'
    };
  }

  if (check.ai?.providerStatus === 'healthy') {
    return {
      label: 'Gemini-assisted',
      color: 'success' as const,
      detail:
        check.ai.source === 'hybrid'
          ? 'Gemini helped refine a hybrid recommendation.'
          : 'Gemini helped shape this recommendation.'
    };
  }

  if (check.ai?.providerStatus === 'degraded') {
    return {
      label: 'AI degraded',
      color: 'warning' as const,
      detail: check.ai.degradedReason ?? 'Gemini returned a degraded result.'
    };
  }

  if (check.ai?.providerStatus === 'unavailable') {
    return {
      label: 'AI unavailable',
      color: 'error' as const,
      detail: check.ai.degradedReason ?? 'Gemini was unavailable, so fallback logic was used.'
    };
  }

  return {
    label: 'Deterministic fallback',
    color: 'warning' as const,
    detail: 'No AI metadata was returned.'
  };
};

const getProposalSummary = (check: StatementCheck) => {
  const proposal = check.proposal;
  if (!proposal?.qbTxnType) return 'No recommendation yet';

  const target =
    proposal.payeeName ??
    proposal.categoryAccountId ??
    proposal.transferTargetAccountId ??
    proposal.bankAccountId ??
    'an account';

  switch (proposal.qbTxnType) {
    case 'Check':
      return `Check to ${target}`;
    case 'Expense':
      return `Expense for ${target}`;
    case 'Deposit':
      return `Deposit to ${target}`;
    case 'Transfer':
      return `Transfer to ${target}`;
    default:
      return proposal.qbTxnType;
  }
};

export const StatementDetailPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'bankStatements', 'view');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');

  const [statement, setStatement] = useState<BankStatementDetail | null>(null);
  const [checks, setChecks] = useState<StatementCheck[]>([]);
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
      setStatement(statementResponse.data.data);
      setChecks(checksResponse.data.data.checks);
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
        const rank = (value: StatementCheck['status']) => {
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

              <Stack spacing={1} sx={{ mt: 1.5 }}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip
                    size="small"
                    variant="outlined"
                    label={`Phase: ${statement.progress.phase.replace(/_/g, ' ')}`}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={formatProgressSummary(statement.progress)}
                  />
                  <Chip size="small" variant="outlined" label={`Total ${statement.progress.totalChecks}`} />
                  <Chip size="small" variant="outlined" label={`Queued ${statement.progress.checksQueued}`} />
                  <Chip size="small" variant="outlined" label={`Processing ${statement.progress.checksProcessing}`} />
                  <Chip size="small" variant="outlined" label={`Ready ${statement.progress.checksReady}`} />
                  <Chip size="small" variant="outlined" label={`Failed ${statement.progress.checksFailed}`} />
                </Stack>
              </Stack>
            </Paper>

            {statement.issues.length > 0 && (
              <Alert severity="warning">
                {statement.issues.join(' | ')}
              </Alert>
            )}

            <Grid container spacing={2}>
              {sortedChecks.map((check) => {
                const proposalMode = getProposalMode(check);
                const proposalSummary = getProposalSummary(check);

                return (
                <Grid key={check.id} size={{ xs: 12, md: 6 }}>
                  <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle2">Check {check.id.slice(-6)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Source: {getCheckSourceLabel(check)}
                        </Typography>
                      </Stack>
                      <Chip
                        size="small"
                        color={statusColor(check.status) as any}
                        label={check.status.replace(/_/g, ' ')}
                      />
                    </Stack>

                    <Stack spacing={1} sx={{ mt: 1 }}>
                      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                        <Chip size="small" variant="outlined" label={`Retries: ${check.processing.retryCount}`} />
                        {check.artifacts?.pageNumber != null ? (
                          <Chip size="small" variant="outlined" label={`Page ${check.artifacts.pageNumber}`} />
                        ) : null}
                        {getCheckArtifactFlags(check).map((flag) => (
                          <Chip key={flag} size="small" variant="outlined" label={flag} />
                        ))}
                      </Stack>
                      <Paper
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          bgcolor: 'action.hover',
                          borderColor: 'divider'
                        }}
                      >
                        <Stack spacing={0.75}>
                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Chip
                              size="small"
                              variant="outlined"
                              color={proposalMode.color as any}
                              label={proposalMode.label}
                            />
                            {check.proposal?.qbTxnType ? (
                              <Chip size="small" variant="outlined" label={check.proposal.qbTxnType} />
                            ) : null}
                            {check.ai?.source ? (
                              <Chip
                                size="small"
                                variant="outlined"
                                label={`Source: ${check.ai.source}`}
                              />
                            ) : null}
                          </Stack>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            Recommended: {proposalSummary}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Proposal confidence:{' '}
                            {check.proposal?.confidence != null
                              ? `${Math.round(check.proposal.confidence * 100)}%`
                              : 'n/a'}
                          </Typography>
                          {check.proposal?.categoryAccountId ? (
                            <Typography variant="body2" color="text.secondary">
                              Category: {check.proposal.categoryAccountId}
                            </Typography>
                          ) : null}
                          {check.proposal?.transferTargetAccountId ? (
                            <Typography variant="body2" color="text.secondary">
                              Transfer target: {check.proposal.transferTargetAccountId}
                            </Typography>
                          ) : null}
                          {check.proposal?.memo ? (
                            <Typography variant="body2" color="text.secondary">
                              Memo: {check.proposal.memo}
                            </Typography>
                          ) : null}
                          {check.proposal?.reasons?.length ? (
                            <Typography variant="caption" color="text.secondary">
                              Proposal reasons: {check.proposal.reasons.join(' • ')}
                            </Typography>
                          ) : null}
                          {(check.ai?.degradedReason || proposalMode.detail) ? (
                            <Typography variant="caption" color="text.secondary">
                              {check.ai?.degradedReason ? `AI note: ${check.ai.degradedReason}` : proposalMode.detail}
                            </Typography>
                          ) : null}
                        </Stack>
                      </Paper>
                      <Stack spacing={0.5}>
                        <Typography variant="body2" color="text.secondary">
                          Check No: {check.extracted?.checkNumber ?? check.autoFill?.checkNumber ?? '-'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Date: {formatMaybeDate(check.extracted?.date ?? check.autoFill?.date)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Payee: {check.extracted?.payeeName ?? check.autoFill?.payeeName ?? '-'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Amount: {formatMoney(check.extracted?.amount ?? check.autoFill?.amount)}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          Confidence:{' '}
                          {check.confidence?.overall != null
                            ? `${Math.round(check.confidence.overall * 100)}%`
                            : 'n/a'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Front: {check.gcs.frontPath}
                        </Typography>
                        {check.artifacts?.cropImagePath ? (
                          <Typography variant="caption" color="text.secondary">
                            Crop: {check.artifacts.cropImagePath}
                          </Typography>
                        ) : null}
                        {check.artifacts?.ocrJsonPath ? (
                          <Typography variant="caption" color="text.secondary">
                            OCR JSON: {check.artifacts.ocrJsonPath}
                          </Typography>
                        ) : null}
                        {check.artifacts?.ocrTextPath ? (
                          <Typography variant="caption" color="text.secondary">
                            OCR Text: {check.artifacts.ocrTextPath}
                          </Typography>
                        ) : null}
                        {check.processing.lastError ? (
                          <Alert severity="error" sx={{ mt: 0.5 }}>
                            {check.processing.lastError}
                          </Alert>
                        ) : null}
                      </Stack>
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
                );
              })}

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
