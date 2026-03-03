import {
  Alert,
  Button,
  Chip,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { QuickBooksSettings } from '@retailsync/shared';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { getAppErrorMessage } from '../../../constants/errorCodes';
import { NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { formatDate } from '../../../utils/date';
import { accountingApi } from '../api';
import { AccountingTabs } from '../components';

type QuickBooksOAuthStatus = {
  ok: boolean;
  reason: string | null;
  expiresInSec: number | null;
};

export const QuickBooksSyncPage = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canConnect = hasPermission(permissions, 'quickbooks', 'actions:connect');
  const canSync = hasPermission(permissions, 'quickbooks', 'actions:sync');

  const [settings, setSettings] = useState<QuickBooksSettings | null>(null);
  const [oauthStatus, setOauthStatus] = useState<QuickBooksOAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, statusResponse] = await Promise.all([
        accountingApi.getQuickbooksSettings(),
        accountingApi.getQuickbooksOAuthStatus()
      ]);
      setSettings(settingsResponse.data.data);
      setOauthStatus(statusResponse.data.data);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load QuickBooks settings'));
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const status = params.get('quickbooks');
    const reason = params.get('reason');
    if (status === 'connected') {
      dispatch(
        showSnackbar({
          message: 'QuickBooks connected successfully.',
          severity: 'success'
        })
      );
      void load().finally(() => {
        navigate('/dashboard/accounting/quickbooks', { replace: true });
      });
      return;
    }
    if (status === 'error') {
      dispatch(
        showSnackbar({
          message: getAppErrorMessage(reason, 'QuickBooks connection failed.'),
          severity: 'error'
        })
      );
      void load().finally(() => {
        navigate('/dashboard/accounting/quickbooks', { replace: true });
      });
    }
  }, [location.search, dispatch, navigate, load]);

  const onConnect = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.getQuickbooksConnectUrl(
        '/dashboard/accounting/quickbooks'
      );
      const url = response.data.data.url;
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to start QuickBooks connection'));
    } finally {
      setBusy(false);
    }
  };

  const onEnvironmentChange = async (environment: 'sandbox' | 'production') => {
    try {
      setBusy(true);
      await accountingApi.updateQuickbooksSettings({ environment });
      await load();
      dispatch(
        showSnackbar({
          message: 'QuickBooks environment updated.',
          severity: 'success'
        })
      );
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to update QuickBooks environment'));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    try {
      setBusy(true);
      await accountingApi.disconnectQuickbooks();
      await load();
      dispatch(
        showSnackbar({
          message: 'QuickBooks disconnected.',
          severity: 'success'
        })
      );
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to disconnect QuickBooks'));
    } finally {
      setBusy(false);
    }
  };

  const onPullAccounts = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.pullQuickbooksAccounts();
      const queue = response.data.data.queue;
      dispatch(
        showSnackbar({
          message:
            queue.mode === 'inline'
              ? 'Chart of Accounts pulled successfully.'
              : 'Chart of Accounts pull queued.',
          severity: 'success'
        })
      );
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to pull QuickBooks accounts'));
    } finally {
      setBusy(false);
    }
  };

  const onSync = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.pushQuickbooksEntries();
      const queue = response.data.data.queue;
      dispatch(
        showSnackbar({
          message:
            queue.mode === 'inline'
              ? 'Posted ledger entries synced to QuickBooks.'
              : 'QuickBooks sync queued.',
          severity: 'success'
        })
      );
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to sync entries to QuickBooks'));
    } finally {
      setBusy(false);
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="QuickBooks Sync"
        subtitle="Connect QuickBooks OAuth and prepare ledger sync."
        icon={<SyncIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}
      {loading ? (
        <Paper sx={{ p: 3 }}>
          <Typography color="text.secondary">Loading QuickBooks settings...</Typography>
        </Paper>
      ) : (
        <Paper sx={{ p: 3, borderRadius: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1}>
              <Typography variant="h6">Connection</Typography>
              <Chip
                size="small"
                color={settings?.connected ? 'success' : 'default'}
                label={settings?.connected ? 'Connected' : 'Not connected'}
                icon={settings?.connected ? <CheckCircleIcon /> : undefined}
                variant={settings?.connected ? 'filled' : 'outlined'}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Environment
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={settings?.environment ?? 'sandbox'}
                onChange={(_event, value: 'sandbox' | 'production' | null) => {
                  if (!value || busy || !canConnect) return;
                  void onEnvironmentChange(value);
                }}
              >
                <ToggleButton value="sandbox">Sandbox</ToggleButton>
                <ToggleButton value="production">Production</ToggleButton>
              </ToggleButtonGroup>
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="body2" color="text.secondary">
                Realm ID: {settings?.realmId ?? 'Not set'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Company: {settings?.companyName ?? 'Not set'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Token status:{' '}
                {oauthStatus?.ok
                  ? `Valid${oauthStatus.expiresInSec != null ? ` (${oauthStatus.expiresInSec}s remaining)` : ''}`
                  : getAppErrorMessage(oauthStatus?.reason ?? undefined, 'Unknown')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Pull status:{' '}
                {settings?.lastPullStatus ?? 'idle'}
                {settings?.lastPullAt ? ` (${formatDate(settings.lastPullAt, 'short')})` : ''}
                {typeof settings?.lastPullCount === 'number'
                  ? ` • count ${settings.lastPullCount}`
                  : ''}
                {settings?.lastPullError ? ` - ${settings.lastPullError}` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Push status:{' '}
                {settings?.lastPushStatus ?? 'idle'}
                {settings?.lastPushAt ? ` (${formatDate(settings.lastPushAt, 'short')})` : ''}
                {typeof settings?.lastPushCount === 'number'
                  ? ` • synced ${settings.lastPushCount}`
                  : ''}
                {settings?.lastPushError ? ` - ${settings.lastPushError}` : ''}
              </Typography>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                variant="outlined"
                disabled={!canConnect || busy}
                onClick={() => void onConnect()}
              >
                {settings?.connected ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}
              </Button>
              <Button
                color="error"
                startIcon={<LinkOffIcon />}
                disabled={!canConnect || busy || !settings?.connected}
                onClick={() => void onDisconnect()}
              >
                Disconnect
              </Button>
              <Button
                variant="outlined"
                disabled={!canSync || !settings?.connected || busy}
                onClick={() => void onPullAccounts()}
              >
                Pull CoA from QB
              </Button>
              <Button
                variant="contained"
                disabled={!canSync || !settings?.connected || busy}
                onClick={() => void onSync()}
              >
                Sync Posted Entries
              </Button>
              <Button
                disabled={busy}
                onClick={() => void load()}
              >
                Refresh Status
              </Button>
            </Stack>
            <Typography color="text.secondary" variant="body2">
              Pull CoA first, then sync posted ledger entries. Sync uses idempotent `qbTxnId`.
            </Typography>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
};

export default QuickBooksSyncPage;
