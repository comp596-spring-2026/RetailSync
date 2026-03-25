import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { Navigate } from 'react-router-dom';

type Props = {
  loading: boolean;
  isConnected: boolean;
  error?: string | null;
  warning?: string | null;
  children: React.ReactNode;
};

export const RequireQuickBooksConnection = ({
  loading,
  isConnected,
  error,
  warning,
  children
}: Props) => {
  if (loading) {
    return (
      <Stack spacing={2}>
        <Alert severity="info">Checking QuickBooks connection...</Alert>
      </Stack>
    );
  }

  if (!isConnected) {
    return <Navigate to="/dashboard/quickbooks" replace state={{ quickbooksRequired: true, quickbooksError: error ?? null }} />;
  }

  return (
    <Stack spacing={2}>
      {warning ? <Alert severity="warning">{warning}</Alert> : null}
      {children}
    </Stack>
  );
};
