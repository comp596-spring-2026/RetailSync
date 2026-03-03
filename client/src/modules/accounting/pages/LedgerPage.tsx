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
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useEffect, useMemo, useState } from 'react';
import { useAppSelector } from '../../../app/store/hooks';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import { formatDate } from '../../../utils/date';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { AccountingTabs } from '../components';
import { accountingApi } from '../api';

type LedgerEntry = {
  _id: string;
  date: string;
  memo: string;
  status: 'draft' | 'posted' | 'reversed';
  lines: Array<{ accountCode: string; debit: number; credit: number }>;
  source?: { statementId?: string; transactionId?: string };
  postedAt?: string | null;
};

export const LedgerPage = () => {
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'ledger', 'view');
  const canPost = hasPermission(permissions, 'ledger', 'actions:post');

  const [status, setStatus] = useState<'draft' | 'posted' | 'reversed' | ''>('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.listLedgerEntries(status || undefined);
      setEntries(response.data.data.entries);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load ledger entries'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView]);

  const draftCount = useMemo(() => entries.filter((entry) => entry.status === 'draft').length, [entries]);

  const postEntry = async (entryId: string) => {
    try {
      await accountingApi.postLedgerEntry(entryId);
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to post ledger entry'));
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="General Ledger"
        subtitle="Review statement-derived entries before posting."
        icon={<AccountTreeIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="body2" color="text.secondary">
              Draft entries:
            </Typography>
            <Chip size="small" label={draftCount} color={draftCount > 0 ? 'warning' : 'default'} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              select
              size="small"
              label="Status"
              value={status}
              onChange={(event) => setStatus((event.target.value || '') as 'draft' | 'posted' | 'reversed' | '')}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="posted">Posted</MenuItem>
              <MenuItem value="reversed">Reversed</MenuItem>
            </TextField>
            <Button variant="outlined" onClick={() => void load()}>
              Apply
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && entries.length === 0}
        loadingLabel="Loading ledger entries..."
        emptyMessage="No ledger entries yet"
        emptySecondary="Confirm a statement to generate draft entries."
      >
        <Paper sx={{ p: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Memo</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Debit</TableCell>
                <TableCell align="right">Credit</TableCell>
                <TableCell>Source</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => {
                const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
                const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
                return (
                  <TableRow key={entry._id}>
                    <TableCell>{entry.date}</TableCell>
                    <TableCell>{entry.memo || '-'}</TableCell>
                    <TableCell>
                      <Chip size="small" label={entry.status} color={entry.status === 'draft' ? 'warning' : 'default'} />
                    </TableCell>
                    <TableCell align="right">{debit.toFixed(2)}</TableCell>
                    <TableCell align="right">{credit.toFixed(2)}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {entry.source?.statementId ? `Statement ${entry.source.statementId.slice(-6)}` : '-'}
                      </Typography>
                      {entry.postedAt && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Posted {formatDate(entry.postedAt, 'short')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {canPost && entry.status === 'draft' ? (
                        <Button size="small" variant="outlined" onClick={() => void postEntry(entry._id)}>
                          Post
                        </Button>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};

export default LedgerPage;
