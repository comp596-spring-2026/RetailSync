import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import { useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppSelector } from '../../../app/store/hooks';
import { canQuickBooksConnect } from '../../../utils/quickbooksPermissions';
import { accountingApi } from '../../accounting/api';
import { QuickBooksLockedSight } from './QuickBooksLockedSight';

type Props = {
  loading: boolean;
  isConnected: boolean;
  isDegraded?: boolean;
  needsReconnect?: boolean;
  error?: string | null;
  warning?: string | null;
  onConnect?: () => void | Promise<void>;
  connectBusy?: boolean;
  children: React.ReactNode;
};

export const RequireQuickBooksConnection = ({
  loading,
  isConnected,
  isDegraded = false,
  needsReconnect = false,
  error,
  warning,
  onConnect,
  connectBusy = false,
  children
}: Props) => {
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canConnect = canQuickBooksConnect(permissions);
  const [localConnectBusy, setLocalConnectBusy] = useState(false);
  const busy = connectBusy || localConnectBusy;

  const defaultConnect = useCallback(async () => {
    try {
      setLocalConnectBusy(true);
      const response = await accountingApi.getQuickbooksConnectUrl(
        `${location.pathname}${location.search}`
      );
      if (typeof window !== 'undefined') {
        window.location.href = response.data.data.url;
      }
    } catch (apiError) {
      throw apiError;
    } finally {
      setLocalConnectBusy(false);
    }
  }, [location.pathname, location.search]);

  const handleConnect = useCallback(() => {
    if (onConnect) {
      void onConnect();
      return;
    }
    void defaultConnect();
  }, [defaultConnect, onConnect]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Alert severity="info">Checking QuickBooks connection...</Alert>
      </Stack>
    );
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
      {!isConnected && error ? <Alert severity="error">{error}</Alert> : null}
      {connectionWarning ? (
        <Alert severity={needsReconnect ? 'error' : 'warning'}>{connectionWarning}</Alert>
      ) : null}
      <QuickBooksLockedSight
        locked={!isConnected}
        onAction={handleConnect}
        actionDisabled={!canConnect || busy}
        actionHint={
          !canConnect && !busy
            ? 'Your role needs QuickBooks connect access. Enable Connect QuickBooks or Edit QuickBooks records on your role.'
            : undefined
        }
      >
        {children}
      </QuickBooksLockedSight>
    </Stack>
  );
};
