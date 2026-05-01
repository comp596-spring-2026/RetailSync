import { Box, Button, Chip, LinearProgress, Paper, Stack, Tooltip, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type { BankStatementStatus } from '@retailsync/shared';
import { formatDate } from '../../../utils/date';
import { buildStatementPrimaryTitle } from '../utils/statementDisplay';
import {
  formatStatementStatusLabel,
  getStatementStageProgress,
  getStatementStatusColor,
  isStatementInFlight
} from '../utils/statementStatus';

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
  canEdit: boolean;
  canDelete: boolean;
  onOpenWorkspace: () => void;
  onOpenLedger: () => void;
  onReprocess: () => void;
  onDelete: () => void;
};

const formatProgressLabel = (progress: StatementWorkflowItem['progress']) =>
  `${progress.completedChecks} done • ${progress.remainingChecks} left`;

const stageIcon = (state: 'done' | 'current' | 'pending' | 'error') => {
  if (state === 'done') return <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />;
  if (state === 'current') return <FiberManualRecordIcon sx={{ fontSize: 16, color: 'info.main' }} />;
  if (state === 'error') return <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />;
  return <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />;
};

export const StatementWorkflowCard = ({
  row,
  canEdit,
  canDelete,
  onOpenWorkspace,
  onOpenLedger,
  onReprocess,
  onDelete
}: StatementWorkflowCardProps) => {
  const stageProgress = getStatementStageProgress(row.status, row.progress);
  const inFlight = isStatementInFlight(row.status);
  const stageTooltip = (
    <Stack spacing={0.75} sx={{ py: 0.5 }}>
      <Typography variant="caption" sx={{ opacity: 0.75 }}>
        {stageProgress.currentLabel} · Step {stageProgress.stepNumber}/{stageProgress.totalSteps}
      </Typography>
      <Stack spacing={0.5}>
        {stageProgress.steps.map((step, index) => (
          <Stack key={step.key} direction="row" spacing={0.75} alignItems="center">
            {stageIcon(step.state)}
            <Typography
              variant="caption"
              sx={{
                fontWeight: step.state === 'current' ? 600 : 400,
                color:
                  step.state === 'pending'
                    ? 'text.disabled'
                    : step.state === 'error'
                      ? 'error.light'
                      : 'text.primary'
              }}
            >
              {index + 1}. {step.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );

  return (
    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
      <Stack spacing={1}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ sm: 'flex-start' }}
        >
          <Stack spacing={0.35} sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" title={`Uploaded file: ${row.fileName}`}>
              {buildStatementPrimaryTitle(row.statementMonth, row.status)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Updated {formatDate(row.updatedAt, 'short')}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }}>
            <Tooltip
              arrow
              placement="left"
              title={stageTooltip}
              componentsProps={{ tooltip: { sx: { bgcolor: 'background.paper', color: 'text.primary', border: '1px solid', borderColor: 'divider', boxShadow: 3, maxWidth: 280 } } }}
            >
              <Chip
                size="small"
                variant="outlined"
                clickable
                label={`${stageProgress.currentLabel} · ${stageProgress.stepNumber}/${stageProgress.totalSteps}`}
                color={getStatementStatusColor(row.status)}
              />
            </Tooltip>
            <Chip
              size="small"
              label={formatStatementStatusLabel(row.status)}
              color={getStatementStatusColor(row.status)}
            />
          </Stack>
        </Stack>

        {inFlight ? (
          <Box sx={{ px: 0.25 }}>
            <LinearProgress
              variant="determinate"
              value={stageProgress.percent}
              sx={{ height: 4, borderRadius: 2 }}
            />
          </Box>
        ) : null}

        {row.progress.totalChecks > 0 ? (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip size="small" variant="outlined" label={formatProgressLabel(row.progress)} />
            {row.issuesCount > 0 ? (
              <Chip
                size="small"
                color="warning"
                variant="outlined"
                label={`${row.issuesCount} issue${row.issuesCount === 1 ? '' : 's'}`}
              />
            ) : null}
          </Stack>
        ) : row.issuesCount > 0 ? (
          <Chip
            size="small"
            color="warning"
            variant="outlined"
            label={`${row.issuesCount} issue${row.issuesCount === 1 ? '' : 's'}`}
          />
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
};
