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
import { useCallback, useEffect, useState } from 'react';
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

export const ObservabilityPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'accounting', 'view');
  const canViewStatements = hasPermission(permissions, 'bankStatements', 'view');
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

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Accounting Observability"
        subtitle="Track pipeline runs, sync health, and diagnostics actions."
        icon={<MonitorHeartIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ md: 'center' }}
          justifyContent="space-between"
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Chip label={`Total ${summary?.counts.totalStatements ?? 0}`} />
            <Chip label={`Extracting ${summary?.counts.extractingStatements ?? 0}`} color={(summary?.counts.extractingStatements ?? 0) > 0 ? 'info' : 'default'} />
            <Chip label={`Structuring ${summary?.counts.structuringStatements ?? 0}`} color={(summary?.counts.structuringStatements ?? 0) > 0 ? 'info' : 'default'} />
            <Chip label={`Checks queued ${summary?.counts.checksQueuedStatements ?? 0}`} color={(summary?.counts.checksQueuedStatements ?? 0) > 0 ? 'warning' : 'default'} />
            <Chip label={`Ready ${summary?.counts.readyForReviewStatements ?? 0}`} color={(summary?.counts.readyForReviewStatements ?? 0) > 0 ? 'success' : 'default'} />
            <Chip label={`Failed ${summary?.counts.failedStatements ?? 0}`} color={(summary?.counts.failedStatements ?? 0) > 0 ? 'error' : 'default'} />
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
                      await accountingApi.refreshQuickbooksReferenceData();
                      dispatch(showSnackbar({ message: 'Reference refresh queued', severity: 'success' }));
                      await loadSummary();
                      await runDebug(debugStatementId || undefined);
                    } catch (apiError) {
                      setError(extractApiErrorMessage(apiError, 'Failed to refresh references'));
                    }
                  }}
                >
                  Refresh Refs
                </Button>
                <Button
                  variant="contained"
                  onClick={async () => {
                    try {
                      await accountingApi.postApprovedToQuickbooks();
                      dispatch(showSnackbar({ message: 'Post-approved sync queued', severity: 'success' }));
                      await loadSummary();
                      await runDebug(debugStatementId || undefined);
                    } catch (apiError) {
                      setError(extractApiErrorMessage(apiError, 'Failed to queue post-approved sync'));
                    }
                  }}
                >
                  Post Approved
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
                Log Shortcuts
              </Typography>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                {[
                  { label: 'API logs', href: summary.gcpLinks.apiLogsUrl },
                  { label: 'Worker logs', href: summary.gcpLinks.workerLogsUrl },
                  { label: 'Failed tasks', href: summary.gcpLinks.failedAccountingTasksUrl },
                  { label: 'QuickBooks sync', href: summary.gcpLinks.quickbooksSyncUrl }
                ].map((link) =>
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
                    <TableCell>Checks</TableCell>
                    <TableCell>Updated</TableCell>
                    <TableCell align="right">Action</TableCell>
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
                        <Chip size="small" label={statement.status} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          total {statement.progress.totalChecks}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          queued {statement.progress.checksQueued} • processing {statement.progress.checksProcessing}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          ready {statement.progress.checksReady} • failed {statement.progress.checksFailed}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatDate(statement.updatedAt, 'short')}</TableCell>
                      <TableCell align="right">
                        {canViewStatements && (
                          <Button
                            size="small"
                            onClick={() =>
                              navigate(`/dashboard/accounting/statements/${statement.id}`)
                            }
                          >
                            Open
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Failed Runs
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Job</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Errors</TableCell>
                    <TableCell>Updated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.failedRuns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          No failed runs.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.failedRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell>
                          <Typography variant="caption">{run.job}</Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                            {run.runType}
                          </Typography>
                        </TableCell>
                        <TableCell>{run.status}</TableCell>
                        <TableCell>
                          <Typography variant="caption" color="error.main">
                            {run.errors.join(' | ') || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell>{formatDate(run.updatedAt, 'short')}</TableCell>
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
                    onClick={() => void runDebug(debugStatementId || undefined)}
                    disabled={debugLoading}
                  >
                    {debugLoading ? 'Running...' : 'Run Debug'}
                  </Button>
                </Stack>

                {debugResult && (
                  <Stack spacing={1}>
                    <Typography variant="subtitle2">Environment Readiness</Typography>
                    <Typography variant="caption" color="text.secondary">
                      tasksMode={debugResult.envReadiness.tasksMode} • gcs={String(debugResult.envReadiness.hasGcsBucketName)} • endpoint={String(debugResult.envReadiness.hasInternalTasksEndpoint)} • qbOAuth={String(debugResult.envReadiness.hasQuickBooksOAuthConfig)}
                    </Typography>
                    <Typography variant="subtitle2">Actions</Typography>
                    {debugResult.actions.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        No actions recommended.
                      </Typography>
                    ) : (
                      debugResult.actions.map((action) => (
                        <Typography key={action} variant="caption" color="text.secondary">
                          • {action}
                        </Typography>
                      ))
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
