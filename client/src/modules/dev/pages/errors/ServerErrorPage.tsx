import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import { ErrorPageLayout } from './ErrorPageLayout';

export const ServerErrorPage = () => (
  <ErrorPageLayout
    code={500}
    title="Something went wrong"
    message="We hit an unexpected error. Please try again in a moment or go back to the dashboard."
    icon={<ErrorOutlineIcon sx={{ fontSize: 48 }} color="error" />}
    primaryAction={{ label: 'Go to dashboard', to: '/dashboard' }}
    secondaryAction={{ label: 'Try again', to: '/' }}
  />
);
