import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import type { QuickBooksIntegrationViewModel } from './buildQuickBooksViewModel';

type Props = {
  viewModel: QuickBooksIntegrationViewModel;
  canManageConnection: boolean;
  canSync: boolean;
  canRefreshStatus: boolean;
  busy: boolean;
  loading: boolean;
  onConnect: () => Promise<void> | void;
  onDisconnect: () => Promise<void> | void;
  onRefreshReferences: () => Promise<void> | void;
  onPostApproved: () => Promise<void> | void;
  onRefreshStatus: () => Promise<void> | void;
  detailAction?: {
    label: string;
    to: string;
  };
};

const getPrimaryDisabledReason = ({
  busy,
  loading,
  canManageConnection,
  canSync,
  viewModel,
}: Pick<Props, 'busy' | 'loading' | 'canManageConnection' | 'canSync' | 'viewModel'>) => {
  if (busy || loading) return 'Please wait for the current action to finish.';
  if (viewModel.primaryAction.kind === 'refresh_reference_data') {
    if (!canSync) return 'You do not have permission to sync QuickBooks.';
    return null;
  }
  if (!canManageConnection) {
    return 'You do not have permission to manage the QuickBooks connection.';
  }
  return null;
};

const getPostDisabledReason = ({
  busy,
  loading,
  canSync,
  viewModel,
}: Pick<Props, 'busy' | 'loading' | 'canSync' | 'viewModel'>) => {
  if (busy || loading) return 'Please wait for the current action to finish.';
  if (!canSync) return 'You do not have permission to sync QuickBooks.';
  if (viewModel.connectionState === 'not_configured') {
    return 'Connect QuickBooks before posting approved entries.';
  }
  if (viewModel.connectionState === 'needs_attention') {
    return 'Reconnect QuickBooks before posting approved entries.';
  }
  return null;
};

const getRefreshStatusDisabledReason = ({
  busy,
  loading,
  canRefreshStatus,
}: Pick<Props, 'busy' | 'loading' | 'canRefreshStatus'>) => {
  if (busy || loading) return 'Please wait for the current action to finish.';
  if (!canRefreshStatus) return 'You do not have permission to refresh QuickBooks status.';
  return null;
};

const getDisconnectDisabledReason = ({
  busy,
  loading,
  canManageConnection,
  viewModel,
}: Pick<Props, 'busy' | 'loading' | 'canManageConnection' | 'viewModel'>) => {
  if (busy || loading) return 'Please wait for the current action to finish.';
  if (!viewModel.showDangerZone) return 'QuickBooks is not connected.';
  if (!canManageConnection) {
    return 'You do not have permission to disconnect QuickBooks.';
  }
  return null;
};

export const QuickBooksActionStack = ({
  viewModel,
  canManageConnection,
  canSync,
  canRefreshStatus,
  busy,
  loading,
  onConnect,
  onDisconnect,
  onRefreshReferences,
  onPostApproved,
  onRefreshStatus,
  detailAction,
}: Props) => {
  const primaryDisabledReason = getPrimaryDisabledReason({
    busy,
    loading,
    canManageConnection,
    canSync,
    viewModel,
  });
  const postDisabledReason = getPostDisabledReason({
    busy,
    loading,
    canSync,
    viewModel,
  });
  const refreshStatusDisabledReason = getRefreshStatusDisabledReason({
    busy,
    loading,
    canRefreshStatus,
  });
  const disconnectDisabledReason = getDisconnectDisabledReason({
    busy,
    loading,
    canManageConnection,
    viewModel,
  });

  const handlePrimaryAction = () => {
    if (viewModel.primaryAction.kind === 'refresh_reference_data') {
      void onRefreshReferences();
      return;
    }
    void onConnect();
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.25 }}>
      <Stack spacing={1}>
        <Typography variant="subtitle2">Actions</Typography>
        <Tooltip title={primaryDisabledReason ?? ''} disableHoverListener={!primaryDisabledReason}>
          <span>
            <Button
              size="small"
              variant="contained"
              fullWidth
              disabled={Boolean(primaryDisabledReason)}
              onClick={handlePrimaryAction}
            >
              {viewModel.primaryAction.label}
            </Button>
          </span>
        </Tooltip>

        <Tooltip title={postDisabledReason ?? ''} disableHoverListener={!postDisabledReason}>
          <span>
            <Button
              size="small"
              variant="outlined"
              fullWidth
              disabled={Boolean(postDisabledReason)}
              onClick={() => void onPostApproved()}
            >
              Post Approved
            </Button>
          </span>
        </Tooltip>

        <Tooltip
          title={refreshStatusDisabledReason ?? ''}
          disableHoverListener={!refreshStatusDisabledReason}
        >
          <span>
            <Button
              size="small"
              variant="outlined"
              fullWidth
              disabled={Boolean(refreshStatusDisabledReason)}
              onClick={() => void onRefreshStatus()}
            >
              Refresh Status
            </Button>
          </span>
        </Tooltip>

        {detailAction ? (
          <Button
            size="small"
            variant="outlined"
            component={RouterLink}
            to={detailAction.to}
            fullWidth
          >
            {detailAction.label}
          </Button>
        ) : null}

        {viewModel.showDangerZone ? (
          <>
            <Divider />
            <Typography variant="caption" color="error.main" sx={{ fontWeight: 700 }}>
              Danger zone
            </Typography>
            <Tooltip
              title={disconnectDisabledReason ?? ''}
              disableHoverListener={!disconnectDisabledReason}
            >
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  fullWidth
                  disabled={Boolean(disconnectDisabledReason)}
                  onClick={() => void onDisconnect()}
                >
                  Disconnect QuickBooks
                </Button>
              </span>
            </Tooltip>
          </>
        ) : null}
      </Stack>
    </Paper>
  );
};
