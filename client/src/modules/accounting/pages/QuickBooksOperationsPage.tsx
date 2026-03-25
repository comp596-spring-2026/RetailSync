import SyncAltIcon from '@mui/icons-material/SyncAlt';
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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { NoAccess, PageHeader } from '../../../components';
import { useAppSelector } from '../../../app/store/hooks';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { accountingApi } from '../api';
import { QuickBooksTabs, RequireQuickBooksConnection } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

type OperationsEntry = {
  id: string;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  reviewStatus: 'proposed' | 'edited' | 'approved' | 'excluded';
  posting: {
    status: 'not_posted' | 'posting' | 'posted' | 'failed';
    qbTxnId?: string;
    error?: string;
    postedAt?: string;
  };
  proposal: {
    qbTxnType?: 'Expense' | 'Deposit' | 'Transfer' | 'Check';
    payeeName?: string;
    memo?: string;
  };
};

const postingColor = (status: OperationsEntry['posting']['status']) => {
  if (status === 'posted') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'posting') return 'info';
  return 'default';
};

export const QuickBooksOperationsPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'ledger', 'view');
  const { loading: workspaceLoading, isConnected, error: workspaceError, warning: workspaceWarning } = useQuickBooksWorkspace(canView);

  const [entries, setEntries] = useState<OperationsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postingStatus, setPostingStatus] = useState<'posted' | 'failed'>('posted');
  const [txnType, setTxnType] = useState<'all' | 'Expense' | 'Deposit' | 'Transfer' | 'Check'>('all');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.listLedgerEntries({
        reviewStatus: 'approved',
        postingStatus,
        search: search || undefined,
        limit: 300
      });
      setEntries(response.data.data.entries as OperationsEntry[]);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks operations'));
    } finally {
      setLoading(false);
    }
  }, [postingStatus, search]);

  useEffect(() => {
    if (!canView || !isConnected) return;
    void load();
  }, [canView, isConnected, load]);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (txnType !== 'all' && entry.proposal.qbTxnType !== txnType) return false;
      if (from && entry.date < from) return false;
      if (to && entry.date > to) return false;
      return true;
    });
  }, [entries, from, to, txnType]);

  const summary = useMemo(() => ({
    total: filteredEntries.length,
    posted: filteredEntries.filter((entry) => entry.posting.status === 'posted').length,
    failed: filteredEntries.filter((entry) => entry.posting.status === 'failed').length
  }), [filteredEntries]);

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Operations"
        subtitle="Review posted and failed QuickBooks-linked ledger rows in one operational queue."
        icon={<SyncAltIcon />}
      />
      <QuickBooksTabs />
      <RequireQuickBooksConnection
        loading={workspaceLoading}
        isConnected={isConnected}
        error={workspaceError}
        warning={workspaceWarning}
      >
        <Paper sx={{ p: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField
              size="small"
              select
              label="Posting Status"
              value={postingStatus}
              onChange={(event) => setPostingStatus(event.target.value as 'posted' | 'failed')}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="posted">Posted</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </TextField>
            <TextField
              size="small"
              select
              label="Txn Type"
              value={txnType}
              onChange={(event) =>
                setTxnType(event.target.value as 'all' | 'Expense' | 'Deposit' | 'Transfer' | 'Check')
              }
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="all">All</MenuItem>
              <MenuItem value="Expense">Expense</MenuItem>
              <MenuItem value="Deposit">Deposit</MenuItem>
              <MenuItem value="Transfer">Transfer</MenuItem>
              <MenuItem value="Check">Check</MenuItem>
            </TextField>
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
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="outlined" onClick={() => void load()}>
              Refresh Queue
            </Button>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <Chip size="small" label={`Total ${summary.total}`} />
            <Chip size="small" color="success" label={`Posted ${summary.posted}`} />
            <Chip size="small" color="error" label={`Failed ${summary.failed}`} />
          </Stack>
          {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Payee</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>QuickBooks ID</TableCell>
                <TableCell>Issue</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.date, 'short')}</TableCell>
                  <TableCell>{entry.proposal.qbTxnType ?? '-'}</TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell>{entry.proposal.payeeName ?? entry.merchant ?? '-'}</TableCell>
                  <TableCell align="right">
                    {entry.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </TableCell>
                  <TableCell>
                    <Chip size="small" color={postingColor(entry.posting.status) as any} label={entry.posting.status} />
                  </TableCell>
                  <TableCell>{entry.posting.qbTxnId ?? '-'}</TableCell>
                  <TableCell>
                    <Typography variant="caption" color={entry.posting.error ? 'error.main' : 'text.secondary'}>
                      {entry.posting.error ?? 'No issues'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button component={RouterLink} to={`/dashboard/accounting/ledger`} size="small" variant="outlined">
                      Open Ledger
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography color="text.secondary">
                      No QuickBooks operations match the current filters.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Paper>
      </RequireQuickBooksConnection>
    </Stack>
  );
};

export default QuickBooksOperationsPage;
