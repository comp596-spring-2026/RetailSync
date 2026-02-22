import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { Link } from 'react-router-dom';

export const OnboardingPage = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, #ecfeff 0%, #f1f5f9 100%)'
      }}
    >
      <Paper sx={{ width: 420, p: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RocketLaunchIcon color="primary" />
          Welcome to RetailSync
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Complete onboarding to continue.
        </Typography>
        <Stack spacing={2}>
          <Button variant="contained" startIcon={<ApartmentIcon />} component={Link} to="/onboarding/create-company">
            Create Company
          </Button>
          <Button variant="outlined" startIcon={<GroupAddIcon />} component={Link} to="/onboarding/join-company">
            Join Company
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};
