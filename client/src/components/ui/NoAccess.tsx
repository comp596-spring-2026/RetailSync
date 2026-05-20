import { Paper, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

export const NoAccess = ({
  message = 'You do not have permission to view this module.'
}: {
  message?: string;
}) => (
  <Paper sx={{ p: 4 }}>
    <Stack spacing={1} alignItems="flex-start">
      <LockOutlinedIcon color="warning" />
      <Typography variant="h5">No Access</Typography>
      <Typography variant="body2">{message}</Typography>
    </Stack>
  </Paper>
);
