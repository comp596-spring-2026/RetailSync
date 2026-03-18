import SyncIcon from '@mui/icons-material/Sync';
import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import type { QuickBooksSettings } from '@retailsync/shared';
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NoAccess, PageHeader } from '../../../components';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { getAppErrorMessage } from '../../../constants/errorCodes';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { QuickBooksIntegrationCard, type QuickBooksOAuthStatus } from '../../settings/components';
import { accountingApi } from '../api';
import { AccountingTabs } from '../components';

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
    if (!canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, statusResponse] = await Promise.all([
        accountingApi.getQuickbooksSettings(),
        accountingApi.getQuickbooksOAuthStatus(),
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
          severity: 'success',
        }),
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
          severity: 'error',
        }),
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
        '/dashboard/accounting/quickbooks',
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

  const onDisconnect = async () => {
    try {
      setBusy(true);
      await accountingApi.disconnectQuickbooks();
      await load();
      dispatch(
        showSnackbar({
          message: 'QuickBooks disconnected.',
          severity: 'success',
        }),
      );
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to disconnect QuickBooks'));
    } finally {
      setBusy(false);
    }
  };

  const onRefreshReferences = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.refreshQuickbooksReferenceData();
      const queue = response.data.data.queue;
      dispatch(
        showSnackbar({
          message:
            queue.mode === 'inline'
              ? 'QuickBooks reference data refreshed.'
              : 'QuickBooks reference refresh queued.',
          severity: 'success',
        }),
      );
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to refresh QuickBooks references'));
    } finally {
      setBusy(false);
    }
  };

  const onPostApproved = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.postApprovedToQuickbooks();
      const queue = response.data.data.queue;
      dispatch(
        showSnackbar({
          message:
            queue.mode === 'inline'
              ? 'Approved ledger entries posted to QuickBooks.'
              : 'Post-approved sync queued.',
          severity: 'success',
        }),
      );
      await load();
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to queue post-approved sync'));
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
        subtitle="Connect, refresh reference data, and post approved ledger entries."
        icon={<SyncIcon />}
      />
      <AccountingTabs />
      {error && <Alert severity="error">{error}</Alert>}
      <QuickBooksIntegrationCard
        settings={settings}
        oauthStatus={oauthStatus}
        canManageConnection={canConnect}
        canSync={canSync}
        canRefreshStatus={canView}
        canViewHealth={canView}
        busy={busy}
        loading={loading}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onRefreshReferences={onRefreshReferences}
        onPostApproved={onPostApproved}
        onRefreshStatus={load}
        initialExpanded
      />
    </Stack>
  );
};

export default QuickBooksSyncPage;
