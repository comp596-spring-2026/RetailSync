import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { ErrorPageLayout } from './ErrorPageLayout';

export const UnauthorizedPage = () => (
  <ErrorPageLayout
    code={401}
    title="Unauthorized"
    message="Your session may have expired or you need to sign in. Please sign in again to continue."
    icon={<LockOutlinedIcon sx={{ fontSize: 48 }} />}
    primaryAction={{ label: 'Sign in', to: '/login' }}
    secondaryAction={{ label: 'Go home', to: '/' }}
  />
);
