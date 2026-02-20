import { Paper, Typography } from '@mui/material';

export const NoAccess = () => (
  <Paper sx={{ p: 4 }}>
    <Typography variant="h5" gutterBottom>
      No Access
    </Typography>
    <Typography variant="body2">You do not have permission to view this module.</Typography>
  </Paper>
);
