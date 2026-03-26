import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { Navigate } from 'react-router-dom';

type Props = {
  loading: boolean;
  isConnected: boolean;
  isDegraded?: boolean;
  needsReconnect?: boolean;
  error?: string | null;
  warning?: string | null;
  children: React.ReactNode;
};

export const RequireQuickBooksConnection = ({
  loading,
  isConnected,
  isDegraded = false,
  needsReconnect = false,
  error,
  warning,
  children,
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

  const connectionWarning =
    warning ??
    (needsReconnect
      ? 'QuickBooks is connected, but it must be reconnected before sync actions can continue.'
      : isDegraded
        ? 'QuickBooks is connected, but the OAuth health is degraded.'
        : null);

  return (
    <Stack spacing={2}>
      {connectionWarning ? (
        <Alert severity={needsReconnect ? 'error' : 'warning'}>{connectionWarning}</Alert>
      ) : null}
      {children}
    </Stack>
  );
};
