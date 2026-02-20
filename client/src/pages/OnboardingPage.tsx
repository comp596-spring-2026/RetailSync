import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export const OnboardingPage = () => {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <Paper sx={{ width: 420, p: 4 }}>
        <Typography variant="h5" gutterBottom>
          Welcome to RetailSync
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Complete onboarding to continue.
        </Typography>
        <Stack spacing={2}>
          <Button variant="contained" component={Link} to="/onboarding/create-company">
            Create Company
          </Button>
          <Button variant="outlined" component={Link} to="/onboarding/join-company">
            Join Company
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};
