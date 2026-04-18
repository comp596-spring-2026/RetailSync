import { Button, Stack } from '@mui/material';
import ApartmentIcon from '@mui/icons-material/Apartment';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import { Link } from 'react-router-dom';
import { AuthShell } from '../../../components';

export const OnboardingPage = () => {
  return (
    <AuthShell
      title="Welcome to RetailSync"
      subtitle="Complete onboarding to continue."
      width={420}
    >
      <Stack spacing={2}>
        <Button variant="contained" startIcon={<ApartmentIcon />} component={Link} to="/onboarding/create-company">
          Create Company
        </Button>
        <Button variant="outlined" startIcon={<GroupAddIcon />} component={Link} to="/onboarding/join-company">
          Join Company
        </Button>
      </Stack>
    </AuthShell>
  );
};
