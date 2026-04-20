import { Paper, Stack, Typography } from '@mui/material';

export const StatementArtifactsPanel = ({
  title,
  items,
  emptyMessage
}: {
  title: string;
  items: Array<[string, string]>;
  emptyMessage: string;
}) => (
  <Stack spacing={1}>
    <Typography variant="subtitle2">{title}</Typography>
    {items.length > 0 ? (
      items.map(([label, value]) => (
        <Paper key={`${label}:${value}`} variant="outlined" sx={{ p: 1, bgcolor: 'background.default' }}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {value}
          </Typography>
        </Paper>
      ))
    ) : (
      <Typography variant="body2" color="text.secondary">
        {emptyMessage}
      </Typography>
    )}
  </Stack>
);
