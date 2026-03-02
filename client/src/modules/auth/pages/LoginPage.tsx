import { Button, Stack } from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import GoogleIcon from '@mui/icons-material/Google';
import { AuthShell } from '../../../components';

export const LoginPage = () => {
  return (
    <AuthShell
      title="Login"
      subtitle="Access your company workspace."
      icon={<LockOpenIcon color="primary" />}
      width={420}
      logoHeight={192}
    >
      <Stack spacing={2}>
        <Button
          variant="outlined"
          startIcon={<GoogleIcon />}
          onClick={() => {
            const apiBase = import.meta.env.VITE_API_URL;
            const origin = apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase;
            window.location.href = `${origin}/api/auth/google/start`;
          }}
        >
          Continue with Google
        </Button>
      </Stack>
    </AuthShell>
  );
};
