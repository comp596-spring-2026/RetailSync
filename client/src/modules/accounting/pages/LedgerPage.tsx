import {
  Alert,
  Button,
  Checkbox,
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
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import { formatDate } from '../../../utils/date';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { AccountingTabs } from '../components';
import { accountingApi } from '../api';

type LedgerEntry = {
  id: string;
  date: string;
  description: string;
  merchant?: string;
  amount: number;
  type: 'debit' | 'credit';
  reviewStatus: 'proposed' | 'edited' | 'approved' | 'excluded';
  posting: {
    status: 'not_posted' | 'posting' | 'posted' | 'failed';
    qbTxnId?: string;
    error?: string;
    postedAt?: string;
  };
  confidence?: {
    overall: number;
  };
  attachments: {
    statementPdfPath?: string;
    checkFrontPath?: string;
  };
  proposal: {
    qbTxnType?: 'Expense' | 'Deposit' | 'Transfer' | 'Check';
    categoryAccountId?: string;
    payeeName?: string;
    memo?: string;
    reasons: string[];
    confidence: number;
  };
};

const reviewColor = (status: LedgerEntry['reviewStatus']) => {
  if (status === 'approved') return 'success';
  if (status === 'excluded') return 'default';
  if (status === 'edited') return 'info';
  return 'warning';
};

const postingColor = (status: LedgerEntry['posting']['status']) => {
  if (status === 'posted') return 'success';
  if (status === 'failed') return 'error';
  if (status === 'posting') return 'info';
  return 'default';
};

export const LedgerPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'ledger', 'view');
  const canPost = hasPermission(permissions, 'ledger', 'actions:post');
  const canEdit = hasPermission(permissions, 'ledger', 'edit');

  const [reviewStatus, setReviewStatus] =
    useState<LedgerEntry['reviewStatus'] | ''>('');
  const [postingStatus, setPostingStatus] =
    useState<LedgerEntry['posting']['status'] | ''>('');
  const [hasCheck, setHasCheck] = useState<'all' | 'yes' | 'no'>('all');
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await accountingApi.listLedgerEntries({
        reviewStatus: reviewStatus || undefined,
        postingStatus: postingStatus || undefined,
        hasCheck:
          hasCheck === 'yes' ? true : hasCheck === 'no' ? false : undefined,
        search: search || undefined,
        limit: 300
      });
      setEntries(response.data.data.entries as LedgerEntry[]);
      setSelected([]);
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

  const kpi = useMemo(() => {
    const total = entries.length;
    const needsReview = entries.filter(
      (entry) => entry.reviewStatus === 'proposed' || entry.reviewStatus === 'edited'
    ).length;
    const approved = entries.filter((entry) => entry.reviewStatus === 'approved').length;
    const posted = entries.filter((entry) => entry.posting.status === 'posted').length;
    return { total, needsReview, approved, posted };
  }, [entries]);

  const toggleSelect = (entryId: string) => {
    setSelected((prev) =>
      prev.includes(entryId)
        ? prev.filter((id) => id !== entryId)
        : [...prev, entryId]
    );
  };

  const approve = async (entryId: string) => {
    try {
      await accountingApi.approveLedgerEntry(entryId);
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to approve entry'));
    }
  };

  const exclude = async (entryId: string) => {
    try {
      await accountingApi.excludeLedgerEntry(entryId);
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to exclude entry'));
    }
  };

  const bulkApprove = async () => {
    if (selected.length === 0) return;
    try {
      await accountingApi.bulkApproveLedgerEntries(selected);
      dispatch(showSnackbar({ message: `Approved ${selected.length} entries`, severity: 'success' }));
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed bulk approve'));
    }
  };

  const postApproved = async () => {
    try {
      await accountingApi.postApprovedLedgerEntries();
      dispatch(
        showSnackbar({
          message: 'Queued QuickBooks post-approved sync',
          severity: 'success'
        })
      );
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to queue post-approved sync'));
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Ledger Review"
        subtitle="Canonical review surface for proposal confidence, evidence, approval, and posting."
        icon={<AccountTreeIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={1.5}
          justifyContent="space-between"
          alignItems={{ md: 'center' }}
        >
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
            <Chip label={`Total ${kpi.total}`} />
            <Chip label={`Needs review ${kpi.needsReview}`} color={kpi.needsReview ? 'warning' : 'default'} />
            <Chip label={`Approved ${kpi.approved}`} color={kpi.approved ? 'success' : 'default'} />
            <Chip label={`Posted ${kpi.posted}`} color={kpi.posted ? 'success' : 'default'} />
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => void load()}>
              Refresh
            </Button>
            <Button
              variant="outlined"
              disabled={!canPost || selected.length === 0}
              onClick={() => void bulkApprove()}
            >
              Bulk Approve ({selected.length})
            </Button>
            <Button
              variant="contained"
              disabled={!canPost}
              onClick={() => void postApproved()}
            >
              Post Approved
            </Button>
          </Stack>
        </Stack>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
          <TextField
            select
            size="small"
            label="Review Status"
            value={reviewStatus}
            onChange={(event) =>
              setReviewStatus((event.target.value || '') as LedgerEntry['reviewStatus'] | '')
            }
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="proposed">Proposed</MenuItem>
            <MenuItem value="edited">Edited</MenuItem>
            <MenuItem value="approved">Approved</MenuItem>
            <MenuItem value="excluded">Excluded</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Posting"
            value={postingStatus}
            onChange={(event) =>
              setPostingStatus(
                (event.target.value || '') as LedgerEntry['posting']['status'] | ''
              )
            }
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="not_posted">Not posted</MenuItem>
            <MenuItem value="posting">Posting</MenuItem>
            <MenuItem value="posted">Posted</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label="Has Check"
            value={hasCheck}
            onChange={(event) => setHasCheck(event.target.value as 'all' | 'yes' | 'no')}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="yes">Yes</MenuItem>
            <MenuItem value="no">No</MenuItem>
          </TextField>
          <TextField
            size="small"
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            sx={{ flexGrow: 1 }}
          />
          <Button variant="outlined" onClick={() => void load()}>
            Apply
          </Button>
        </Stack>
      </Paper>

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && entries.length === 0}
        loadingLabel="Loading ledger entries..."
        emptyMessage="No ledger entries yet"
        emptySecondary="Process statements to populate ledger review rows."
      >
        <Paper sx={{ p: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>Date</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Review</TableCell>
                <TableCell>Posting</TableCell>
                <TableCell>Conf</TableCell>
                <TableCell>Evidence</TableCell>
                <TableCell>Proposal</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map((entry) => {
                const isSelected = selected.includes(entry.id);
                return (
                  <TableRow key={entry.id} selected={isSelected}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={isSelected}
                        onChange={() => toggleSelect(entry.id)}
                        disabled={entry.reviewStatus === 'excluded' || entry.posting.status === 'posted'}
                      />
                    </TableCell>
                    <TableCell>{entry.date}</TableCell>
                    <TableCell>
                      <Typography variant="body2">{entry.description}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.merchant || '-'}
                      </Typography>
                      {entry.posting.error && (
                        <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                          {entry.posting.error}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {entry.type === 'debit' ? '-' : '+'}
                      {Math.abs(entry.amount).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={reviewColor(entry.reviewStatus) as any}
                        label={entry.reviewStatus}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={postingColor(entry.posting.status) as any}
                        label={entry.posting.status}
                      />
                      {entry.posting.postedAt && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {formatDate(entry.posting.postedAt, 'short')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.confidence?.overall != null
                        ? `${Math.round(entry.confidence.overall * 100)}%`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        PDF {entry.attachments.statementPdfPath ? 'yes' : 'no'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        CHK {entry.attachments.checkFrontPath ? 'yes' : 'no'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {entry.proposal.qbTxnType ?? '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {entry.proposal.categoryAccountId ?? '-'}
                      </Typography>
                      {entry.proposal.reasons?.[0] && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          {entry.proposal.reasons[0]}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        {canPost && entry.reviewStatus !== 'approved' && entry.reviewStatus !== 'excluded' && (
                          <Button size="small" variant="outlined" onClick={() => void approve(entry.id)}>
                            Approve
                          </Button>
                        )}
                        {canEdit && entry.reviewStatus !== 'excluded' && entry.posting.status !== 'posted' && (
                          <Button size="small" onClick={() => void exclude(entry.id)}>
                            Exclude
                          </Button>
                        )}
                      </Stack>
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
