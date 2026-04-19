import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import {
  Alert,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { QuickBooksSettings } from '@retailsync/shared';
import { NoAccess, PageHeader } from '../../components';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import { showSnackbar } from '../../app/store/uiSlice';
import { getAppErrorMessage } from '../../constants/errorCodes';
import { hasPermission } from '../../utils/permissions';
import { extractApiErrorMessage } from '../../utils/apiError';
import { accountingApi } from '../accounting/api';
import { useQuickBooksWorkspace } from './hooks/useQuickBooksWorkspace';
import { QuickBooksCard } from './components/QuickBooksCard';
import { QUICKBOOKS_QUICK_ACCESS_ITEMS, QUICKBOOKS_SECTION_DESCRIPTIONS } from './constants';

const connectionChipColor = (status: 'connected' | 'degraded' | 'not_connected') => {
  if (status === 'connected') return 'success';
  if (status === 'degraded') return 'warning';
  return 'default';
};

const tokenHealthLabel = (
  status: ReturnType<typeof useQuickBooksWorkspace>['oauthStatus'],
  workspaceStatus: ReturnType<typeof useQuickBooksWorkspace>['connectionStatus']
) => {
  if (!status || workspaceStatus === 'not_connected') return 'Not connected';
  if (workspaceStatus === 'degraded') return 'Needs attention';
  if (status.expiresInSec == null) return 'Healthy';
  if (status.expiresInSec < 900) return 'Expiring soon';
  return 'Healthy';
};

export const QuickBooksDashboard = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'quickbooks', 'view');
  const canConnect = hasPermission(permissions, 'quickbooks', 'actions:connect');

  const {
    settings,
    oauthStatus,
    loading,
    error,
    load,
    connectionStatus,
    warning
  } = useQuickBooksWorkspace(canView);
  const [pageError, setPageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      dispatch(showSnackbar({ message: 'QuickBooks connected successfully.', severity: 'success' }));
      void load().finally(() => navigate('/dashboard/quickbooks', { replace: true }));
      return;
    }

    if (status === 'error') {
      dispatch(
        showSnackbar({
          message: getAppErrorMessage(reason, 'QuickBooks connection failed.'),
          severity: 'error'
        })
      );
      void load().finally(() => navigate('/dashboard/quickbooks', { replace: true }));
    }
  }, [dispatch, load, location.search, navigate]);

  const onConnect = async () => {
    try {
      setBusy(true);
      const response = await accountingApi.getQuickbooksConnectUrl('/dashboard/quickbooks');
      if (typeof window !== 'undefined') {
        window.location.href = response.data.data.url;
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
      dispatch(showSnackbar({ message: 'QuickBooks disconnected.', severity: 'success' }));
    } catch (apiError) {
      setPageError(extractApiErrorMessage(apiError, 'Failed to disconnect QuickBooks'));
    } finally {
      setBusy(false);
    }
  };

  const groupedQuickAccess = useMemo(
    () =>
      QUICKBOOKS_QUICK_ACCESS_ITEMS.reduce<Record<string, typeof QUICKBOOKS_QUICK_ACCESS_ITEMS>>((acc, item) => {
        acc[item.section] = [...(acc[item.section] ?? []), item];
        return acc;
      }, {}),
    []
  );

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        title="QuickBooks"
        subtitle="Use this workspace for connected-company operations, live reads, and write flows."
        icon={<GroupsOutlinedIcon />}
      />

      {pageError ? <Alert severity="error">{pageError}</Alert> : null}
      {warning ? <Alert severity="warning">{warning}</Alert> : null}

      <Stack spacing={2.5}>
        {Object.entries(groupedQuickAccess).map(([section, items]) => (
          <Stack key={section} spacing={1.25}>
            <Stack spacing={0.35}>
              <Typography variant="overline" color="text.secondary">
                {section}
              </Typography>
              <Typography variant="h6">{QUICKBOOKS_SECTION_DESCRIPTIONS[section as keyof typeof QUICKBOOKS_SECTION_DESCRIPTIONS]}</Typography>
            </Stack>
            <Stack
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: '1fr',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  xl: 'repeat(4, minmax(0, 1fr))'
                }
              }}
            >
              {items.map((item) => (
                <QuickBooksCard
                  key={item.to}
                  title={item.title}
                  description={item.description}
                  icon={item.icon}
                  onClick={() => navigate(item.to)}
                />
              ))}
            </Stack>
          </Stack>
        ))}
      </Stack>

      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack spacing={2.5}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
          >
            <Stack spacing={0.5}>
              <Typography variant="h6">Connection</Typography>
              <Typography variant="body2" color="text.secondary">
                Current status, connected company details, and token health.
              </Typography>
            </Stack>

            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Button variant="outlined" onClick={() => void load()} disabled={loading || busy}>
                Refresh
              </Button>
              <Button
                variant="outlined"
                onClick={() => void onConnect()}
                disabled={!canConnect || busy}
              >
                {settings?.connected ? 'Reconnect' : 'Connect'}
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={() => void onDisconnect()}
                disabled={!settings?.connected || busy}
              >
                Disconnect
              </Button>
            </Stack>
          </Stack>

          <Divider />

          <Stack
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(2, minmax(0, 1fr))',
                xl: 'repeat(4, minmax(0, 1fr))'
              }
            }}
          >
            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Chip
                label={connectionStatus === 'not_connected' ? 'Not connected' : connectionStatus}
                color={connectionChipColor(connectionStatus)}
                sx={{ alignSelf: 'flex-start', textTransform: 'capitalize' }}
              />
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Company
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                {oauthStatus?.companyName ?? (settings as QuickBooksSettings | null)?.companyName ?? '-'}
              </Typography>
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Realm ID
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                {oauthStatus?.realmId ?? (settings as QuickBooksSettings | null)?.realmId ?? '-'}
              </Typography>
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="caption" color="text.secondary">
                Token health
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                {tokenHealthLabel(oauthStatus, connectionStatus)}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
};

export default QuickBooksDashboard;
