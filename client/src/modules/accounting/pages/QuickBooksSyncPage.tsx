import InsightsIcon from '@mui/icons-material/Insights';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SyncIcon from '@mui/icons-material/Sync';
import StorefrontIcon from '@mui/icons-material/Storefront';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { QuickBooksSettings } from '@retailsync/shared';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { NoAccess, PageHeader } from '../../../components';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { getAppErrorMessage } from '../../../constants/errorCodes';
import { hasPermission } from '../../../utils/permissions';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { QuickBooksIntegrationCard } from '../../settings/components';
import { accountingApi } from '../api';
import { QuickBooksTabs } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

export const QuickBooksHomePage = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canConnect = hasPermission(permissions, 'quickbooks', 'actions:connect');
  const canSync = hasPermission(permissions, 'quickbooks', 'actions:sync');

  const {
    settings,
    oauthStatus,
    loading,
    error,
    load,
    isConnected,
    warning,
    isDegraded,
    needsReconnect,
  } = useQuickBooksWorkspace(canView);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      setPageError(error);
    }
  }, [error]);

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
  }, [dispatch, load, location.search, navigate]);

  const onConnect = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.getQuickbooksConnectUrl('/dashboard/accounting/quickbooks');
      const url = response.data.data.url;
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (apiError) {
      setPageError(extractApiErrorMessage(apiError, 'Failed to start QuickBooks connection'));
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    try {
      setBusy(true);
      await accountingApi.disconnectQuickBooks();
      await load();
      dispatch(
        showSnackbar({
          message: 'QuickBooks disconnected.',
          severity: 'success'
        })
      );
    } catch (apiError) {
      setPageError(extractApiErrorMessage(apiError, 'Failed to disconnect QuickBooks'));
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
          severity: 'success'
        })
      );
      await load();
    } catch (apiError) {
      setPageError(extractApiErrorMessage(apiError, 'Failed to refresh QuickBooks references'));
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
          severity: 'success'
        })
      );
      await load();
    } catch (apiError) {
      setPageError(extractApiErrorMessage(apiError, 'Failed to queue post-approved sync'));
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
        title="QuickBooks"
        subtitle="Connection, token health, reference sync, and approved posting live here."
        icon={<SyncIcon />}
      />
      <QuickBooksTabs />
      {pageError ? <Alert severity="error">{pageError}</Alert> : null}
      {warning ? (
        <Alert severity={needsReconnect ? 'error' : 'warning'}>
          {warning}
        </Alert>
      ) : null}
      {!loading && !isConnected ? (
        <Alert severity="info">
          Connect QuickBooks to access reports, operations, and tax tools.
        </Alert>
      ) : null}
      <QuickBooksIntegrationCard
        settings={settings as QuickBooksSettings | null}
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

export const QuickBooksSyncPage = QuickBooksHomePage;

export default QuickBooksHomePage;
