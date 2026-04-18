import {
  Alert,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { BankStatementStatus } from '@retailsync/shared';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { formatDate } from '../../../utils/date';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import { UploadStatementDialog } from '../components';

type StatementItem = {
  id: string;
  statementMonth: string;
  fileName: string;
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

const statusColor = (
  status: BankStatementStatus
): 'default' | 'info' | 'warning' | 'success' | 'error' => {
  if (status === 'extracting' || status === 'structuring' || status === 'checks_queued') return 'info';
  if (status === 'ready_for_review') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
};

const statusOptions: Array<{ value: BankStatementStatus; label: string }> = [
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'extracting', label: 'Extracting' },
  { value: 'structuring', label: 'Structuring' },
  { value: 'checks_queued', label: 'Checks queued' },
  { value: 'ready_for_review', label: 'Ready for review' },
  { value: 'failed', label: 'Failed' }
];

const formatProgressLabel = (progress: StatementItem['progress']) => {
  return `${progress.completedChecks} done • ${progress.remainingChecks} left`;
};

const formatStatusLabel = (status: BankStatementStatus) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const getStageSummary = (row: StatementItem) => {
  if (row.status === 'failed') {
    return row.issuesCount > 0
      ? `${row.issuesCount} issue${row.issuesCount === 1 ? '' : 's'} need attention`
      : 'Processing stopped and needs attention';
  }

  if (row.status === 'ready_for_review') {
    return row.progress.totalChecks > 0
      ? `${row.progress.checksReady} checks ready for review`
      : 'Artifacts are ready for review';
  }

  if (row.progress.totalChecks > 0) {
    return `${formatProgressLabel(row.progress)} across ${row.progress.totalChecks} checks`;
  }

  if (row.status === 'uploaded') {
    return 'Saved and waiting to start background processing';
  }

  if (row.status === 'extracting') {
    return 'Extracting text and page data from the PDF';
  }

  if (row.status === 'structuring') {
    return 'Structuring transactions and statement sections';
  }

  if (row.status === 'checks_queued') {
    return 'Preparing check review items';
  }

  return 'In progress';
};

export const StatementsPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'bankStatements', 'view');
  const canCreate = hasPermission(permissions, 'bankStatements', 'create');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');
  const canDelete = hasPermission(permissions, 'bankStatements', 'delete');

  const [rows, setRows] = useState<StatementItem[]>([]);
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState<BankStatementStatus | ''>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.listStatements({
        month: month || undefined,
        status: status || undefined,
        search: search || undefined
      });
      setRows(response.data.data.statements);
    } catch (loadError) {
      setError(extractApiErrorMessage(loadError, 'Failed to load statements'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView]);

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

  const deleteStatement = async (id: string, fileName: string) => {
    const confirmed = window.confirm(
      `Delete ${fileName}? This removes the statement and its extracted processing records.`
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

  const onUploaded = async () => {
    dispatch(
      showSnackbar({
        message: 'Statement uploaded and processing started',
        severity: 'success'
      })
    );
    await load();
  };

  const hasRows = useMemo(() => rows.length > 0, [rows]);
  const summary = useMemo(() => {
    const failed = rows.filter((row) => row.status === 'failed').length;
    const active = rows.filter((row) =>
      row.status === 'extracting' || row.status === 'structuring' || row.status === 'checks_queued'
    ).length;
    const ready = rows.filter((row) => row.status === 'ready_for_review').length;
    return { failed, active, ready };
  }, [rows]);

  const sections = useMemo(
    () => [
      {
        title: 'Processing now',
        subtitle: 'Statements actively moving through extraction, structuring, or check processing.',
        rows: rows.filter((row) =>
          row.status === 'uploaded' ||
          row.status === 'extracting' ||
          row.status === 'structuring' ||
          row.status === 'checks_queued'
        )
      },
      {
        title: 'Needs attention',
        subtitle: 'Statements that failed and need reprocess or cleanup.',
        rows: rows.filter((row) => row.status === 'failed')
      },
      {
        title: 'Ready for review',
        subtitle: 'Statements with extracted outputs ready for suggestions and ledger review.',
        rows: rows.filter((row) => row.status === 'ready_for_review')
      }
    ],
    [rows]
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Bank Statements"
        subtitle="Upload statements and monitor extraction/check processing before ledger approval."
        icon={<AccountBalanceIcon />}
      />
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', md: 'center' }}
        >
          <TextField
            label="Month"
            type="month"
            size="small"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 170 }}
          />
          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) =>
              setStatus((event.target.value || '') as BankStatementStatus | '')
            }
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All</MenuItem>
            {statusOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Search file"
            size="small"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ flexGrow: 1 }}
          />
          <Button variant="outlined" onClick={() => void load()}>
            Refresh
          </Button>
          <Button variant="contained" onClick={() => setUploadOpen(true)} disabled={!canCreate}>
            Upload PDF
          </Button>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Active processing
          </Typography>
          <Typography variant="h5">{summary.active}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Ready for review
          </Typography>
          <Typography variant="h5">{summary.ready}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Failed statements
          </Typography>
          <Typography variant="h5">{summary.failed}</Typography>
        </Paper>
      </Stack>

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !hasRows}
        loadingLabel="Loading statements..."
        emptyMessage="No statements uploaded yet"
        emptySecondary="Upload a PDF to start extraction."
      >
        <Stack spacing={2}>
          {sections.map((section) => (
            <Paper key={section.title} sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Stack spacing={0.25}>
                  <Typography variant="subtitle1">{section.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {section.subtitle}
                  </Typography>
                </Stack>

                {section.rows.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No statements in this stage right now.
                  </Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {section.rows.map((row) => (
                      <Paper key={row.id} variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
                        <Stack spacing={1.25}>
                          <Stack
                            direction={{ xs: 'column', md: 'row' }}
                            spacing={1}
                            justifyContent="space-between"
                            alignItems={{ md: 'center' }}
                          >
                            <Stack spacing={0.35}>
                              <Typography variant="subtitle2">{row.fileName}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                Month {row.statementMonth} • Updated {formatDate(row.updatedAt, 'short')}
                              </Typography>
                              <Typography variant="body2">{getStageSummary(row)}</Typography>
                            </Stack>
                            <Chip
                              size="small"
                              label={formatStatusLabel(row.status)}
                              color={statusColor(row.status)}
                            />
                          </Stack>

                          {row.progress.totalChecks > 0 || row.issuesCount > 0 ? (
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {row.progress.totalChecks > 0 ? (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={`${row.progress.totalChecks} checks`}
                                />
                              ) : null}
                              {row.progress.totalChecks > 0 ? (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  label={formatProgressLabel(row.progress)}
                                />
                              ) : null}
                              {row.issuesCount > 0 ? (
                                <Chip
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  label={`${row.issuesCount} issue${row.issuesCount === 1 ? '' : 's'}`}
                                />
                              ) : null}
                            </Stack>
                          ) : null}

                          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => navigate(`/dashboard/accounting/statements/${row.id}`)}
                            >
                              Open workspace
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate('/dashboard/accounting/ledger')}
                              disabled={row.status !== 'ready_for_review'}
                            >
                              Open ledger
                            </Button>
                            {canEdit ? (
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => void reprocess(row.id)}
                              >
                                Reprocess
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                startIcon={<DeleteOutlineIcon />}
                                onClick={() => void deleteStatement(row.id, row.fileName)}
                              >
                                Delete
                              </Button>
                            ) : null}
                          </Stack>
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Stack>
            </Paper>
          ))}
        </Stack>
      </LoadingEmptyStateWrapper>

      <UploadStatementDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={onUploaded}
      />
    </Stack>
  );
};

export default StatementsPage;
