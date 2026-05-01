import { Chip, Paper, Stack, Typography } from '@mui/material';

export type TimelineStepState = 'done' | 'active' | 'waiting' | 'failed';

export type StatementTimelineStep = {
  key: string;
  title: string;
  detail: string;
  state: TimelineStepState;
};

const getTimelineChipColor = (state: TimelineStepState) => {
  if (state === 'done') return 'success';
  if (state === 'active') return 'primary';
  if (state === 'failed') return 'error';
  return 'default';
};

const getTimelineChipLabel = (state: TimelineStepState) => {
  if (state === 'done') return 'Done';
  if (state === 'active') return 'Current';
  if (state === 'failed') return 'Failed';
  return 'Waiting';
};

export const StatementStageTimeline = ({
  title,
  subtitle,
  steps,
  detailMode = 'always'
}: {
  title: string;
  subtitle?: string;
  steps: StatementTimelineStep[];
  /** Show step detail only for active/failed rows, or always (default). */
  detailMode?: 'always' | 'active';
}) => (
  <Paper variant="outlined" sx={{ p: 1.5 }}>
    <Stack spacing={1}>
      <Typography variant="subtitle2">{title}</Typography>
      {subtitle ? (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      ) : null}
      <Stack spacing={0.75}>
        {steps.map((step) => (
          <Paper
            key={step.key}
            variant="outlined"
            sx={{
              p: 1,
              bgcolor: step.state === 'active' ? 'action.hover' : 'background.default',
              borderColor:
                step.state === 'active'
                  ? 'primary.main'
                  : step.state === 'failed'
                    ? 'error.main'
                    : 'divider'
            }}
          >
            <Stack spacing={0.5}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {step.title}
                </Typography>
                <Chip size="small" color={getTimelineChipColor(step.state)} label={getTimelineChipLabel(step.state)} />
              </Stack>
              {(detailMode === 'always' || step.state === 'active' || step.state === 'failed') && (
                <Typography variant="caption" color="text.secondary">
                  {step.detail}
                </Typography>
              )}
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Stack>
  </Paper>
);
