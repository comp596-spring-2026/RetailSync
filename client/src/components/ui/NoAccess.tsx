import { Paper, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';

export const NoAccess = () => (
  <Paper sx={{ p: 4 }}>
    <Stack spacing={1} alignItems="flex-start">
      <LockOutlinedIcon color="warning" />
      <Typography variant="h5">No Access</Typography>
      <Typography variant="body2">You do not have permission to view this module.</Typography>
    </Stack>
  </Paper>
);
