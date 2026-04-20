import { Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { BankStatementStatus } from '@retailsync/shared';
import { formatDate } from '../../../utils/date';
import { formatStatementStatusLabel, getStatementStatusColor } from '../utils/statementStatus';

export type StatementWorkflowItem = {
  id: string;
  statementMonth: string;
  fileName: string;
  status: BankStatementStatus;
  progress: {
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

type StatementWorkflowCardProps = {
  row: StatementWorkflowItem;
  stageSummary: string;
  canEdit: boolean;
  canDelete: boolean;
  onOpenWorkspace: () => void;
  onOpenLedger: () => void;
  onReprocess: () => void;
  onDelete: () => void;
};

const formatProgressLabel = (progress: StatementWorkflowItem['progress']) =>
  `${progress.completedChecks} done • ${progress.remainingChecks} left`;

export const StatementWorkflowCard = ({
  row,
  stageSummary,
  canEdit,
  canDelete,
  onOpenWorkspace,
  onOpenLedger,
  onReprocess,
  onDelete
}: StatementWorkflowCardProps) => (
  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
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
          <Typography variant="body2">{stageSummary}</Typography>
        </Stack>
        <Chip
          size="small"
          label={formatStatementStatusLabel(row.status)}
          color={getStatementStatusColor(row.status)}
        />
      </Stack>

      {row.progress.totalChecks > 0 || row.issuesCount > 0 ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {row.progress.totalChecks > 0 ? (
            <Chip size="small" variant="outlined" label={`${row.progress.totalChecks} checks`} />
          ) : null}
          {row.progress.totalChecks > 0 ? (
            <Chip size="small" variant="outlined" label={formatProgressLabel(row.progress)} />
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
        <Button size="small" variant="contained" onClick={onOpenWorkspace}>
          Open workspace
        </Button>
        <Button
          size="small"
          variant="outlined"
          onClick={onOpenLedger}
          disabled={row.status !== 'ready_for_review'}
        >
          Open ledger
        </Button>
        {canEdit ? (
          <Button size="small" variant="outlined" onClick={onReprocess}>
            Reprocess
          </Button>
        ) : null}
        {canDelete ? (
          <Button size="small" color="error" variant="outlined" onClick={onDelete}>
            Delete
          </Button>
        ) : null}
      </Stack>
    </Stack>
  </Paper>
);
