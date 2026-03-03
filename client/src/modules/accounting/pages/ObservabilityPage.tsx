import {
  Alert,
  Button,
  Chip,
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
import MonitorHeartIcon from '@mui/icons-material/MonitorHeart';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BugReportIcon from '@mui/icons-material/BugReport';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import { AccountingTabs } from '../components';

type Summary = Awaited<ReturnType<typeof accountingApi.getObservabilitySummary>>['data']['data'];
type DebugResult = Awaited<ReturnType<typeof accountingApi.runObservabilityDebug>>['data']['data'];

const healthColor = (value: number) => {
  if (value <= 0) return 'success.main';
  if (value <= 3) return 'warning.main';
  return 'error.main';
};

export const ObservabilityPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'accounting', 'view');
  const canViewStatements = hasPermission(permissions, 'bankStatements', 'view');
  const canEditStatements = hasPermission(permissions, 'bankStatements', 'edit');
  const canSyncQuickBooks = hasPermission(permissions, 'quickbooks', 'actions:sync');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
  const [debugStatementId, setDebugStatementId] = useState('');
  const [loading, setLoading] = useState(true);
  const [debugLoading, setDebugLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.getObservabilitySummary();
      setSummary(response.data.data);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load observability summary'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  const runDebug = useCallback(
    async (statementId?: string) => {
      if (!canView) return;
      setDebugLoading(true);
      try {
        const response = await accountingApi.runObservabilityDebug(statementId);
        setDebugResult(response.data.data);
      } catch (apiError) {
        setError(extractApiErrorMessage(apiError, 'Failed to run diagnostics'));
      } finally {
        setDebugLoading(false);
      }
    },
    [canView]
  );

  useEffect(() => {
    if (!canView) return;
    void loadSummary();
    void runDebug();
  }, [canView, loadSummary, runDebug]);

  const staleProcessingCount = useMemo(
    () =>
      (summary?.recentStatements ?? []).filter((statement) => statement.isStaleProcessing)
        .length,
    [summary]
  );

  const logLinks = useMemo(
    () => [
      { label: 'API logs', href: summary?.gcpLinks.apiLogsUrl ?? null },
      { label: 'Worker logs', href: summary?.gcpLinks.workerLogsUrl ?? null },
      {
        label: 'Failed tasks',
        href: summary?.gcpLinks.failedAccountingTasksUrl ?? null
      },
      { label: 'QuickBooks sync', href: summary?.gcpLinks.quickbooksSyncUrl ?? null }
    ],
    [summary]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Accounting Observability"
        subtitle="Track statement pipeline health, QuickBooks sync, and run diagnostics."
        icon={<MonitorHeartIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Chip label={`Total ${summary?.counts.totalStatements ?? 0}`} />
            <Chip
              label={`Processing ${summary?.counts.processingStatements ?? 0}`}
              color={summary?.counts.processingStatements ? 'info' : 'default'}
            />
            <Chip
              label={`Needs review ${summary?.counts.needsReviewStatements ?? 0}`}
              color={summary?.counts.needsReviewStatements ? 'warning' : 'default'}
            />
            <Chip
              label={`Failed ${summary?.counts.failedStatements ?? 0}`}
              color={summary?.counts.failedStatements ? 'error' : 'default'}
            />
            <Chip
              label={`Stale processing ${staleProcessingCount}`}
              sx={{ color: healthColor(staleProcessingCount) }}
              variant="outlined"
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => void loadSummary()} disabled={loading}>
              Refresh
            </Button>
            {canSyncQuickBooks && (
              <>
                <Button
                  variant="outlined"
                  onClick={async () => {
                    try {
                      await accountingApi.pullQuickbooksAccounts();
                      dispatch(showSnackbar({ message: 'QuickBooks CoA pull started', severity: 'success' }));
                      await loadSummary();
                      await runDebug(debugStatementId || undefined);
                    } catch (apiError) {
                      setError(extractApiErrorMessage(apiError, 'Failed to start QuickBooks CoA pull'));
                    }
                  }}
                >
                  Pull CoA
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      await accountingApi.pushQuickbooksEntries();
                      dispatch(showSnackbar({ message: 'QuickBooks ledger sync started', severity: 'success' }));
                      await loadSummary();
                      await runDebug(debugStatementId || undefined);
                    } catch (apiError) {
                      setError(extractApiErrorMessage(apiError, 'Failed to start QuickBooks ledger sync'));
                    }
                  }}
                >
                  Sync Entries
                </Button>
              </>
            )}
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Generated at: {summary?.generatedAt ? formatDate(summary.generatedAt, 'short') : '-'}
        </Typography>
      </Paper>

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !summary}
        loadingLabel="Loading observability summary..."
        emptyMessage="No observability data available"
      >
        {summary && (
          <>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                QuickBooks Sync Status
              </Typography>
              {summary.quickbooks ? (
                <Stack spacing={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    Connected={String(summary.quickbooks.connected)} • Env={summary.quickbooks.environment} • Realm=
                    {summary.quickbooks.realmId ?? 'n/a'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Pull: {summary.quickbooks.lastPullStatus} • count {summary.quickbooks.lastPullCount}
                    {summary.quickbooks.lastPullAt ? ` • ${formatDate(summary.quickbooks.lastPullAt, 'short')}` : ''}
                    {summary.quickbooks.lastPullError ? ` • ${summary.quickbooks.lastPullError}` : ''}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Push: {summary.quickbooks.lastPushStatus} • count {summary.quickbooks.lastPushCount}
                    {summary.quickbooks.lastPushAt ? ` • ${formatDate(summary.quickbooks.lastPushAt, 'short')}` : ''}
                    {summary.quickbooks.lastPushError ? ` • ${summary.quickbooks.lastPushError}` : ''}
                  </Typography>
                </Stack>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  QuickBooks settings not initialized yet.
                </Typography>
              )}
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Typography variant="h6">Log Shortcuts</Typography>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  {logLinks.map((link) =>
                    link.href ? (
                      <Button
                        key={link.label}
                        variant="outlined"
                        endIcon={<OpenInNewIcon />}
                        component="a"
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {link.label}
                      </Button>
                    ) : (
                      <Button key={link.label} variant="outlined" disabled>
                        {link.label}
                      </Button>
                    )
                  )}
                </Stack>
              </Stack>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Recent Statements
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Month</TableCell>
                    <TableCell>File</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Last job</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.recentStatements.map((statement) => (
                    <TableRow key={statement.id}>
                      <TableCell>{statement.statementMonth}</TableCell>
                      <TableCell>
                        <Typography variant="body2">{statement.fileName}</Typography>
                        {statement.issuesCount > 0 && (
                          <Typography variant="caption" color="warning.main">
                            {statement.issuesCount} issue(s)
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center">
                          <Chip size="small" label={statement.status} />
                          {statement.isStaleProcessing && (
                            <Chip size="small" color="warning" label="Stale" />
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {statement.lastJob ? (
                          <Stack spacing={0.25}>
                            <Typography variant="caption">
                              {statement.lastJob.jobType} ({statement.lastJob.status})
                            </Typography>
                            {statement.lastJob.error && (
                              <Typography variant="caption" color="error.main">
                                {statement.lastJob.error}
                              </Typography>
                            )}
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(statement.updatedAt, 'short')}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          {canViewStatements && (
                            <Button
                              size="small"
                              onClick={() =>
                                navigate(`/dashboard/accounting/statements/${statement.id}`)
                              }
                            >
                              Review
                            </Button>
                          )}
                          {canEditStatements && (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={async () => {
                                try {
                                  await accountingApi.reprocessStatement(statement.id);
                                  dispatch(showSnackbar({ message: 'Reprocess queued', severity: 'success' }));
                                  await loadSummary();
                                } catch (apiError) {
                                  setError(extractApiErrorMessage(apiError, 'Failed to reprocess statement'));
                                }
                              }}
                            >
                              Reprocess
                            </Button>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Failed Job Runs
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Statement</TableCell>
                    <TableCell>Job</TableCell>
                    <TableCell>Error</TableCell>
                    <TableCell>Ended</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.failedJobs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <Typography variant="body2" color="text.secondary">
                          No failed job runs in the recent statement window.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.failedJobs.map((job) => (
                      <TableRow key={`${job.taskId}-${job.statementId}-${job.jobType}`}>
                        <TableCell>
                          <Typography variant="caption">
                            {job.statementMonth} • {job.fileName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {job.jobType} (attempt {job.attempt})
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" color="error.main">
                            {job.error}
                          </Typography>
                        </TableCell>
                        <TableCell>{job.endedAt ? formatDate(job.endedAt, 'short') : '-'}</TableCell>
                        <TableCell align="right">
                          {canViewStatements && (
                            <Button
                              size="small"
                              onClick={() =>
                                navigate(`/dashboard/accounting/statements/${job.statementId}`)
                              }
                            >
                              Open
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <BugReportIcon fontSize="small" />
                  <Typography variant="h6">Debug Diagnostics</Typography>
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                  <TextField
                    label="Statement ID (optional)"
                    size="small"
                    value={debugStatementId}
                    onChange={(event) => setDebugStatementId(event.target.value)}
                    sx={{ minWidth: 320 }}
                  />
                  <Button
                    variant="outlined"
                    disabled={debugLoading}
                    onClick={() => void runDebug(debugStatementId || undefined)}
                  >
                    {debugLoading ? 'Running...' : 'Run diagnostics'}
                  </Button>
                </Stack>

                {debugResult && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Environment Readiness</Typography>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={0.75}>
                      <Chip
                        size="small"
                        label={`tasksMode=${debugResult.envReadiness.tasksMode}`}
                        color="info"
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        label={`gcs=${String(debugResult.envReadiness.hasGcsBucketName)}`}
                        color={debugResult.envReadiness.hasGcsBucketName ? 'success' : 'error'}
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        label={`tasksEndpoint=${String(
                          debugResult.envReadiness.tasksMode === 'inline' ||
                            debugResult.envReadiness.hasInternalTasksEndpoint
                        )}`}
                        color={
                          debugResult.envReadiness.tasksMode === 'inline' ||
                          debugResult.envReadiness.hasInternalTasksEndpoint
                            ? 'success'
                            : 'error'
                        }
                        variant="outlined"
                      />
                      <Chip
                        size="small"
                        label={`quickbooksOAuth=${String(
                          debugResult.envReadiness.hasQuickBooksOAuthConfig
                        )}`}
                        color={
                          debugResult.envReadiness.hasQuickBooksOAuthConfig
                            ? 'success'
                            : 'warning'
                        }
                        variant="outlined"
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      apiService={debugResult.envReadiness.apiServiceName ?? 'n/a'} •
                      workerService={debugResult.envReadiness.workerServiceName ?? 'n/a'}
                    </Typography>

                    {debugResult.statementDebug && (
                      <>
                        <Typography variant="subtitle2">Statement Diagnostics</Typography>
                        {'found' in debugResult.statementDebug &&
                        debugResult.statementDebug.found ? (
                          <Stack spacing={0.25}>
                            <Typography variant="body2" color="text.secondary">
                              status={debugResult.statementDebug.status} • stage=
                              {debugResult.statementDebug.processingStage} • stale=
                              {String(debugResult.statementDebug.isStaleProcessing)} • issues=
                              {debugResult.statementDebug.issues.length}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              pages={debugResult.statementDebug.pageCount} • checks=
                              {debugResult.statementDebug.checkCount} • recentRuns=
                              {debugResult.statementDebug.recentJobRuns.length}
                            </Typography>
                          </Stack>
                        ) : (
                          <Alert severity={debugResult.statementDebug.invalidId ? 'warning' : 'info'}>
                            {debugResult.statementDebug.invalidId
                              ? 'Invalid statement id format.'
                              : 'Statement not found for this tenant.'}
                          </Alert>
                        )}
                      </>
                    )}

                    <Typography variant="subtitle2">QuickBooks Diagnostics</Typography>
                    <Typography variant="body2" color="text.secondary">
                      connected={String(debugResult.quickbooksDebug.connected)} • mappedAccounts=
                      {debugResult.quickbooksDebug.mappedAccountsCount} • postedUnsynced=
                      {debugResult.quickbooksDebug.postedUnsyncedCount} • syncErrors=
                      {debugResult.quickbooksDebug.postedSyncErrorCount}
                    </Typography>
                    {debugResult.quickbooksDebug.topSyncErrors.length > 0 && (
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Memo</TableCell>
                            <TableCell>Error</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {debugResult.quickbooksDebug.topSyncErrors.map((row) => (
                            <TableRow key={row.entryId}>
                              <TableCell>{row.date}</TableCell>
                              <TableCell>{row.memo || '-'}</TableCell>
                              <TableCell>
                                <Typography variant="caption" color="error.main">
                                  {row.error ?? 'Unknown'}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {debugResult.actions.length > 0 && (
                      <Alert severity="warning">
                        {debugResult.actions.map((action, index) => (
                          <Typography key={`${action}-${index}`} variant="body2">
                            {index + 1}. {action}
                          </Typography>
                        ))}
                      </Alert>
                    )}
                  </Stack>
                )}
              </Stack>
            </Paper>
          </>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};

export default ObservabilityPage;
