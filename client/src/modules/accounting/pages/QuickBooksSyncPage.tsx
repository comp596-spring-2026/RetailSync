import InsightsIcon from '@mui/icons-material/Insights';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import SyncIcon from '@mui/icons-material/Sync';
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
import { QuickBooksIntegrationCard, type QuickBooksOAuthStatus } from '../../settings/components';
import { accountingApi } from '../api';
import { QuickBooksTabs } from '../components';
import { useQuickBooksWorkspace } from '../hooks/useQuickBooksWorkspace';

const shortcutItems = [
  {
    title: 'Reports',
    description: 'Balance Sheet, Profit & Loss, Trial Balance, ledger views, and reporting filters.',
    to: '/dashboard/quickbooks/reports',
    icon: <InsightsIcon />
  },
  {
    title: 'Operations',
    description: 'Review posted and failed QuickBooks-linked ledger rows in one operational queue.',
    to: '/dashboard/quickbooks/operations',
    icon: <SyncIcon />
  },
  {
    title: 'Tax',
    description: 'Recover payments and create journal adjustments against the connected QuickBooks company.',
    to: '/dashboard/quickbooks/tax',
    icon: <ReceiptLongIcon />
  }
];

export const QuickBooksHomePage = () => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canConnect = hasPermission(permissions, 'quickbooks', 'actions:connect');
  const canSync = hasPermission(permissions, 'quickbooks', 'actions:sync');

  const { settings, oauthStatus, loading, error, load, isConnected } = useQuickBooksWorkspace(canView);
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
        navigate('/dashboard/quickbooks', { replace: true });
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
        navigate('/dashboard/quickbooks', { replace: true });
      });
    }
  }, [dispatch, load, location.search, navigate]);

  const onConnect = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.getQuickbooksConnectUrl('/dashboard/quickbooks');
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
      await accountingApi.disconnectQuickbooks();
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
      {!loading && !isConnected ? (
        <Alert severity="info">
          Connect QuickBooks to access reports, operations, and tax tools.
        </Alert>
      ) : null}
      <QuickBooksIntegrationCard
        settings={settings as QuickBooksSettings | null}
        oauthStatus={oauthStatus as QuickBooksOAuthStatus | null}
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

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          QuickBooks Workspace
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Once connected, use these areas to explore reports, review operational posting outcomes, and run tax repair tools.
        </Typography>
        <Stack spacing={1.5}>
          {shortcutItems.map((item) => {
            const disabled = !isConnected;
            return (
              <Paper
                key={item.to}
                variant="outlined"
                sx={{
                  p: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  {item.icon}
                  <Stack spacing={0.25}>
                    <Typography variant="subtitle2">{item.title}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {item.description}
                    </Typography>
                  </Stack>
                </Stack>
                <Button
                  component={RouterLink}
                  to={item.to}
                  variant="outlined"
                  disabled={disabled}
                >
                  Open
                </Button>
              </Paper>
            );
          })}
        </Stack>
      </Paper>
    </Stack>
  );
};

export const QuickBooksSyncPage = QuickBooksHomePage;

export default QuickBooksHomePage;
