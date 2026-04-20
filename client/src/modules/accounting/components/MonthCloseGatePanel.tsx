import { Chip, Paper, Stack, Typography } from '@mui/material';

export type MonthCloseGateState = {
  rowsReviewed: boolean;
  noBlockingExtractionFailures: boolean;
  noMandatoryUnknowns: boolean;
  noPendingMandatorySuggestionDecisions: boolean;
};

export const MonthCloseGatePanel = ({ gates }: { gates: MonthCloseGateState }) => (
  <Stack spacing={0.75}>
    <Typography variant="subtitle2">Completion gates</Typography>
    <Typography variant="caption" color="text.secondary">
      All gates must pass before month close can be completed.
    </Typography>
    {[
      ['Rows reviewed', gates.rowsReviewed],
      ['No blocking extraction failures', gates.noBlockingExtractionFailures],
      ['No mandatory unknown entries', gates.noMandatoryUnknowns],
      ['No pending mandatory suggestion decisions', gates.noPendingMandatorySuggestionDecisions]
    ].map(([label, passed]) => (
      <Paper key={String(label)} variant="outlined" sx={{ p: 1, bgcolor: 'background.default' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="body2">{String(label)}</Typography>
          <Chip size="small" color={passed ? 'success' : 'default'} label={passed ? 'Passed' : 'Pending'} />
        </Stack>
      </Paper>
    ))}
  </Stack>
);
