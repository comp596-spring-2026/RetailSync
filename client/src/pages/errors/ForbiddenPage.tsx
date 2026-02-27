import BlockIcon from '@mui/icons-material/Block';
import { ErrorPageLayout } from './ErrorPageLayout';

export const ForbiddenPage = () => (
  <ErrorPageLayout
    code={403}
    title="Access denied"
    message="You don't have permission to view or do that. If you believe this is an error, ask your company admin for access."
    icon={<BlockIcon sx={{ fontSize: 48 }} />}
    primaryAction={{ label: 'Go to dashboard', to: '/dashboard' }}
    secondaryAction={{ label: 'Sign out', to: '/login' }}
  />
);
