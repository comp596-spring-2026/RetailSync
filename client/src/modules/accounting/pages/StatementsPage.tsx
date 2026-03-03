import {
  Alert,
  Button,
  Chip,
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
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
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
import { AccountingTabs, UploadStatementDialog } from '../components';

type StatementItem = {
  id: string;
  statementMonth: string;
  fileName: string;
  status: BankStatementStatus;
  processingStage?: string;
  pageCount: number;
  checkCount: number;
  issuesCount: number;
  updatedAt: string;
};

const statusColor = (status: BankStatementStatus): 'default' | 'info' | 'warning' | 'success' | 'error' => {
  if (status === 'processing') return 'info';
  if (status === 'needs_review') return 'warning';
  if (status === 'confirmed' || status === 'locked') return 'success';
  if (status === 'failed') return 'error';
  return 'default';
};

const statusOptions: Array<{ value: BankStatementStatus; label: string }> = [
  { value: 'uploaded', label: 'Uploaded' },
  { value: 'processing', label: 'Processing' },
  { value: 'needs_review', label: 'Needs review' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'locked', label: 'Locked' },
  { value: 'failed', label: 'Failed' }
];

export const StatementsPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'accounting', 'view') || hasPermission(permissions, 'bankStatements', 'view');
  const canCreate = hasPermission(permissions, 'bankStatements', 'create');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');
  const canConfirm = hasPermission(permissions, 'bankStatements', 'actions:confirm');
  const canLock = hasPermission(permissions, 'bankStatements', 'actions:lock');

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
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to reprocess statement'), severity: 'error' }));
    }
  };

  const confirm = async (id: string) => {
    try {
      await accountingApi.confirmStatement(id);
      dispatch(showSnackbar({ message: 'Statement confirmed', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to confirm statement'), severity: 'error' }));
    }
  };

  const lock = async (id: string) => {
    try {
      await accountingApi.lockStatement(id);
      dispatch(showSnackbar({ message: 'Statement locked', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(showSnackbar({ message: extractApiErrorMessage(apiError, 'Failed to lock statement'), severity: 'error' }));
    }
  };

  const onUploaded = async () => {
    dispatch(showSnackbar({ message: 'Statement uploaded and processing started', severity: 'success' }));
    await load();
  };

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Bank Statements"
        subtitle="Upload statements, extract checks, and review transactions before posting."
        icon={<AccountBalanceIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
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
            onChange={(event) => setStatus((event.target.value || '') as BankStatementStatus | '')}
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
            Apply
          </Button>
          <Button variant="contained" onClick={() => setUploadOpen(true)} disabled={!canCreate}>
            Upload PDF
          </Button>
        </Stack>
      </Paper>

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !hasRows}
        loadingLabel="Loading statements..."
        emptyMessage="No statements uploaded yet"
        emptySecondary="Upload a PDF to start extraction."
      >
        <Paper sx={{ p: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Month</TableCell>
                <TableCell>File</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Pages</TableCell>
                <TableCell>Checks</TableCell>
                <TableCell>Updated</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.statementMonth}</TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{row.fileName}</Typography>
                      {row.issuesCount > 0 && (
                        <Typography variant="caption" color="warning.main">
                          {row.issuesCount} issue(s)
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={row.status.replace('_', ' ')} color={statusColor(row.status)} />
                  </TableCell>
                  <TableCell>{row.pageCount}</TableCell>
                  <TableCell>{row.checkCount}</TableCell>
                  <TableCell>{formatDate(row.updatedAt, 'short')}</TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} justifyContent="flex-end">
                      <Button size="small" onClick={() => navigate(`/dashboard/accounting/statements/${row.id}`)}>
                        Review
                      </Button>
                      {canEdit && (
                        <Button size="small" variant="outlined" onClick={() => void reprocess(row.id)}>
                          Reprocess
                        </Button>
                      )}
                      {canConfirm && row.status === 'needs_review' && (
                        <Button size="small" variant="outlined" onClick={() => void confirm(row.id)}>
                          Confirm
                        </Button>
                      )}
                      {canLock && row.status === 'confirmed' && (
                        <Button size="small" variant="outlined" color="warning" onClick={() => void lock(row.id)}>
                          Lock
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
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
