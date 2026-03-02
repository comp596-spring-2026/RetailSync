import SearchOffIcon from '@mui/icons-material/SearchOff';
import { ErrorPageLayout } from './ErrorPageLayout';

export const NotFoundPage = () => (
  <ErrorPageLayout
    code={404}
    title="Page not found"
    message="The page you're looking for doesn't exist or was moved. Check the address or go back to the dashboard."
    icon={<SearchOffIcon sx={{ fontSize: 48 }} />}
    primaryAction={{ label: 'Go to dashboard', to: '/dashboard' }}
    secondaryAction={{ label: 'Sign in', to: '/login' }}
  />
);
