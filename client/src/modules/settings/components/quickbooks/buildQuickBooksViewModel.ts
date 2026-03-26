import type { QuickBooksSettings } from '@retailsync/shared';
import {
  normalizeQuickBooksOAuthStatus,
  type QuickBooksOAuthStatusInput,
  type QuickBooksOAuthWorkspaceStatus,
} from '../../types/quickbooks';

type StatusTone = 'default' | 'info' | 'success' | 'warning' | 'error';
type ConnectionState = 'loading' | 'not_configured' | 'needs_attention' | 'connected';
type PrimaryActionKind = 'connect' | 'reconnect' | 'refresh_reference_data';

export type QuickBooksDetailRow = {
  label: string;
  value: string;
  tone?: StatusTone;
};

export type QuickBooksSyncSummary = {
  key: 'reference-data' | 'approved-posting';
  title: string;
  subtitle: string;
  status: QuickBooksSettings['lastPullStatus'];
  statusLabel: string;
  statusTone: StatusTone;
  lastRunLabel: string;
  countLabel: string;
  count: number;
  error: string | null;
  detail: string;
};

export type QuickBooksIntegrationViewModel = {
  connectionState: ConnectionState;
  statusLabel: string;
  statusTone: StatusTone;
  connectorLabel: string;
  connectorCaption: string;
  sourceLabel: string;
  infoLabel: string;
  rowActionLabel: string;
  summaryText: string;
  showSandboxWarning: boolean;
  companyLabel: string;
  realmLabel: string;
  lastUpdatedLabel: string;
  connectionDetails: QuickBooksDetailRow[];
  connectionNotice: {
    severity: 'warning' | 'error';
    message: string;
  } | null;
  tokenHealth: {
    label: string;
    tone: StatusTone;
    message: string;
    details: QuickBooksDetailRow[];
  };
  syncSummaries: QuickBooksSyncSummary[];
  primaryAction: {
    kind: PrimaryActionKind;
    label: string;
  };
  showDangerZone: boolean;
};

type BuildQuickBooksViewModelInput = {
  settings: QuickBooksSettings | null;
  oauthStatus?: QuickBooksOAuthStatusInput;
  loading?: boolean;
  canViewHealth?: boolean;
};

const formatTimestamp = (value: string | null | undefined, emptyLabel = 'Not yet') =>
  value ? new Date(value).toLocaleString() : emptyLabel;

const formatExpiresIn = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return 'Expiration unavailable';
  if (value < 60) return `${value}s remaining`;
  if (value < 3600) return `${Math.floor(value / 60)}m remaining`;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  return minutes > 0 ? `${hours}h ${minutes}m remaining` : `${hours}h remaining`;
};

const getSyncStatusLabel = (status: QuickBooksSettings['lastPullStatus']) => {
  switch (status) {
    case 'running':
      return 'Running';
    case 'success':
      return 'Healthy';
    case 'error':
      return 'Needs attention';
    default:
      return 'Idle';
  }
};

const getSyncStatusTone = (status: QuickBooksSettings['lastPullStatus']): StatusTone => {
  switch (status) {
    case 'running':
      return 'info';
    case 'success':
      return 'success';
    case 'error':
      return 'warning';
    default:
      return 'default';
  }
};

const formatQuickBooksReason = (reason: string | null | undefined) => {
  switch (reason) {
    case 'not_connected':
      return 'QuickBooks is not connected';
    case 'quickbooks_secret_missing':
      return 'Stored QuickBooks credentials are missing';
    case 'quickbooks_refresh_token_missing':
      return 'Refresh token is missing';
    case 'quickbooks_invalid_grant':
      return 'The QuickBooks connection was revoked or expired';
    case 'quickbooks_invalid_client':
      return 'QuickBooks app credentials are invalid';
    case 'quickbooks_oauth_not_configured':
      return 'QuickBooks OAuth is not configured';
    case 'encryption_key_missing':
      return 'Encryption key is missing';
    case 'encryption_key_invalid':
      return 'Encryption key is invalid';
    case 'oauth_state_mismatch':
      return 'OAuth state validation failed';
    case 'invalid_oauth_state':
      return 'OAuth state is invalid';
    default:
      return reason
        ? reason.replace(/_/g, ' ')
        : 'QuickBooks needs to be reconnected';
  }
};

const buildTokenHealthDetails = (oauthStatus: QuickBooksOAuthWorkspaceStatus): QuickBooksDetailRow[] => {
  const accessTokenExpiresIn =
    oauthStatus.health?.accessTokenExpiresInSec ?? oauthStatus.expiresInSec;

  return [
    {
      label: 'Checked',
      value: formatTimestamp(oauthStatus.health?.checkedAt, 'Not available'),
    },
    {
      label: 'Access token',
      value: formatExpiresIn(accessTokenExpiresIn),
      tone:
        accessTokenExpiresIn != null && accessTokenExpiresIn < 900
          ? 'warning'
          : 'default',
    },
    {
      label: 'Refresh token',
      value: formatExpiresIn(oauthStatus.health?.refreshTokenExpiresInSec),
      tone:
        oauthStatus.health?.refreshTokenExpiresInSec != null &&
        oauthStatus.health.refreshTokenExpiresInSec < 86400
          ? 'warning'
          : 'default',
    },
    {
      label: 'Last refresh',
      value: formatTimestamp(oauthStatus.health?.refreshedAt, 'Not available'),
    },
    {
      label: 'Notes',
      value:
        oauthStatus.health?.lastRefreshError ??
        (oauthStatus.reason ? formatQuickBooksReason(oauthStatus.reason) : 'No issues detected'),
      tone:
        oauthStatus.health?.lastRefreshError || oauthStatus.needsReconnect
          ? 'warning'
          : 'default',
    },
  ];
};

export const buildQuickBooksViewModel = ({
  settings,
  oauthStatus = null,
  loading = false,
  canViewHealth = true,
}: BuildQuickBooksViewModelInput): QuickBooksIntegrationViewModel => {
  const normalizedOauthStatus = normalizeQuickBooksOAuthStatus(oauthStatus, settings);
  const connected = Boolean(normalizedOauthStatus?.connected ?? settings?.connected);
  const degraded = Boolean(
    connected &&
      (normalizedOauthStatus?.degraded ||
        normalizedOauthStatus?.status === 'degraded' ||
        normalizedOauthStatus?.health?.status === 'degraded'),
  );
  const needsReconnect = Boolean(connected && normalizedOauthStatus?.needsReconnect);
  const sourceLabel = loading
    ? 'Loading…'
    : (normalizedOauthStatus?.environment ?? settings?.environment) === 'production'
      ? 'Production'
      : 'Sandbox';
  const companyLabel = connected
    ? normalizedOauthStatus?.companyName?.trim() || settings?.companyName?.trim() || 'Not set'
    : 'Not connected';
  const realmLabel = connected
    ? normalizedOauthStatus?.realmId?.trim() || settings?.realmId?.trim() || 'Not set'
    : 'Not connected';
  const lastUpdatedLabel = formatTimestamp(settings?.updatedAt, loading ? 'Loading…' : 'Not yet');

  let connectionState: ConnectionState = 'connected';
  if (loading) {
    connectionState = 'loading';
  } else if (!connected) {
    connectionState = 'not_configured';
  } else if (needsReconnect) {
    connectionState = 'needs_attention';
  }

  const statusLabel =
    connectionState === 'loading'
      ? 'Loading'
      : connectionState === 'not_configured'
        ? 'Not configured'
        : connectionState === 'needs_attention'
          ? 'Reconnect required'
          : degraded
            ? 'Degraded'
            : 'Connected';

  const statusTone: StatusTone =
    connectionState === 'loading'
      ? 'info'
      : connectionState === 'not_configured'
        ? 'default'
        : connectionState === 'needs_attention'
          ? 'error'
          : degraded
            ? 'warning'
            : 'success';

  const infoLabel = loading
    ? 'Loading company details…'
    : connected
      ? [
          normalizedOauthStatus?.companyName?.trim() || settings?.companyName?.trim() || 'Company not set',
          normalizedOauthStatus?.realmId?.trim() || settings?.realmId?.trim()
            ? `Realm ID ${normalizedOauthStatus?.realmId?.trim() || settings?.realmId}`
            : 'Realm ID not set',
        ].join(' • ')
      : 'No company connected yet';

  const summaryText =
    connectionState === 'loading'
      ? 'Loading QuickBooks connection, token health, and sync summary.'
      : connectionState === 'not_configured'
        ? `No company connected yet. ${sourceLabel} mode will be used for the next QuickBooks connection.`
        : connectionState === 'needs_attention'
          ? `${companyLabel} is still connected in ${sourceLabel} mode, but it must be reconnected before sync actions can continue.`
          : degraded
            ? `${companyLabel} is connected in ${sourceLabel} mode, but QuickBooks health is degraded and sync actions may be unreliable.`
            : `${companyLabel} is connected in ${sourceLabel} mode and ready for reference refresh and approved posting.`;

  const connectionNotice =
    connectionState === 'needs_attention'
        ? {
            severity: 'error' as const,
          message: `${formatQuickBooksReason(normalizedOauthStatus?.reason)}. Reconnect QuickBooks before posting or refreshing data.`,
        }
      : degraded
        ? {
            severity: 'warning' as const,
            message:
              normalizedOauthStatus?.health?.lastRefreshError ??
              (normalizedOauthStatus?.reason
                ? `${formatQuickBooksReason(normalizedOauthStatus.reason)}. Reads remain available, but sync actions may fail until token health recovers.`
                : 'QuickBooks OAuth health is degraded. Reads remain available, but sync actions may fail until token health recovers.'),
          }
        : null;

  const tokenHealth = (() => {
    if (loading) {
      return {
        label: 'Checking',
        tone: 'info' as StatusTone,
        message: 'Loading QuickBooks OAuth token status.',
        details: [
          { label: 'Checked', value: 'Checking…' },
          { label: 'Access token', value: 'Checking…' },
          { label: 'Refresh token', value: 'Checking…' },
          { label: 'Last refresh', value: 'Checking…' },
          { label: 'Notes', value: 'Status pending' },
        ],
      };
    }
    if (!connected) {
      return {
        label: 'Not connected',
        tone: 'default' as StatusTone,
        message: 'Connect QuickBooks to validate the OAuth token and enable sync actions.',
        details: [
          { label: 'Checked', value: 'Not available' },
          { label: 'Access token', value: 'Not available' },
          { label: 'Refresh token', value: 'Not available' },
          { label: 'Last refresh', value: 'Not available' },
          { label: 'Notes', value: 'No active connection' },
        ],
      };
    }
    if (!canViewHealth) {
      return {
        label: 'Unavailable',
        tone: 'default' as StatusTone,
        message: 'Token health is not available with your current permissions.',
        details: [
          { label: 'Checked', value: 'Restricted' },
          { label: 'Access token', value: 'Restricted' },
          { label: 'Refresh token', value: 'Restricted' },
          { label: 'Last refresh', value: 'Restricted' },
          { label: 'Notes', value: 'Requires quickbooks:view' },
        ],
      };
    }
    if (normalizedOauthStatus == null) {
      return {
        label: 'Checking',
        tone: 'info' as StatusTone,
        message: 'Checking the current QuickBooks OAuth token status.',
        details: [
          { label: 'Checked', value: 'Checking…' },
          { label: 'Access token', value: 'Checking…' },
          { label: 'Refresh token', value: 'Checking…' },
          { label: 'Last refresh', value: 'Checking…' },
          { label: 'Notes', value: 'Status pending' },
        ],
      };
    }
    if (needsReconnect) {
      return {
        label: 'Reconnect required',
        tone: 'error' as StatusTone,
        message: `${formatQuickBooksReason(normalizedOauthStatus.reason)}. Reconnect QuickBooks to restore sync actions.`,
        details: buildTokenHealthDetails(normalizedOauthStatus),
      };
    }
    if (degraded) {
      return {
        label: 'Degraded',
        tone: 'warning' as StatusTone,
        message:
          normalizedOauthStatus.health?.lastRefreshError ??
          'QuickBooks remains connected, but the OAuth health is degraded and some sync actions may fail.',
        details: buildTokenHealthDetails(normalizedOauthStatus),
      };
    }
    return {
      label: 'Healthy',
      tone: 'success' as StatusTone,
      message: 'QuickBooks OAuth token is healthy and ready for sync actions.',
      details: buildTokenHealthDetails(normalizedOauthStatus),
    };
  })();

  const syncSummaries: QuickBooksSyncSummary[] = [
    {
      key: 'reference-data',
      title: 'Reference data',
      subtitle: 'Chart of accounts and supporting QuickBooks data',
      status: settings?.lastPullStatus ?? 'idle',
      statusLabel: getSyncStatusLabel(settings?.lastPullStatus ?? 'idle'),
      statusTone: getSyncStatusTone(settings?.lastPullStatus ?? 'idle'),
      lastRunLabel: formatTimestamp(settings?.lastPullAt, loading ? 'Loading…' : 'Not yet'),
      countLabel: 'Records refreshed',
      count: settings?.lastPullCount ?? 0,
      error: settings?.lastPullError ?? null,
      detail:
        settings?.lastPullError ??
        ((settings?.lastPullStatus ?? 'idle') === 'idle'
          ? 'No QuickBooks activity yet.'
          : (settings?.lastPullStatus ?? 'idle') === 'running'
            ? 'Reference refresh is currently in progress.'
            : 'No outstanding issues recorded.'),
    },
    {
      key: 'approved-posting',
      title: 'Approved posting',
      subtitle: 'Approved ledger entries sent to QuickBooks',
      status: settings?.lastPushStatus ?? 'idle',
      statusLabel: getSyncStatusLabel(settings?.lastPushStatus ?? 'idle'),
      statusTone: getSyncStatusTone(settings?.lastPushStatus ?? 'idle'),
      lastRunLabel: formatTimestamp(settings?.lastPushAt, loading ? 'Loading…' : 'Not yet'),
      countLabel: 'Entries posted',
      count: settings?.lastPushCount ?? 0,
      error: settings?.lastPushError ?? null,
      detail:
        settings?.lastPushError ??
        ((settings?.lastPushStatus ?? 'idle') === 'idle'
          ? 'No QuickBooks activity yet.'
          : (settings?.lastPushStatus ?? 'idle') === 'running'
            ? 'Approved posting is currently in progress.'
            : 'No outstanding issues recorded.'),
    },
  ];

  const primaryAction =
    connectionState === 'not_configured'
      ? { kind: 'connect' as PrimaryActionKind, label: 'Connect QuickBooks' }
      : connectionState === 'needs_attention'
        ? { kind: 'reconnect' as PrimaryActionKind, label: 'Reconnect QuickBooks' }
        : { kind: 'refresh_reference_data' as PrimaryActionKind, label: 'Refresh Reference Data' };

  const connectionDetails: QuickBooksDetailRow[] = [
    { label: 'Status', value: statusLabel, tone: statusTone },
    { label: 'Company', value: companyLabel },
    { label: 'Realm ID', value: realmLabel },
    { label: 'Environment', value: sourceLabel },
    {
      label: 'Workspace',
      value:
        connectionState === 'needs_attention'
          ? 'Reconnect required'
          : degraded
            ? 'Connected with degraded health'
            : connected
              ? 'Connected and healthy'
              : 'Not connected',
      tone: statusTone,
    },
    { label: 'Last updated', value: lastUpdatedLabel },
  ];

  return {
    connectionState,
    statusLabel,
    statusTone,
    connectorLabel: 'QuickBooks Company',
    connectorCaption: 'Reference refresh and approved posting',
    sourceLabel,
    infoLabel,
    rowActionLabel: 'Change settings',
    summaryText,
    showSandboxWarning: Boolean(
      (normalizedOauthStatus?.environment ?? settings?.environment) === 'sandbox' && connected,
    ),
    companyLabel,
    realmLabel,
    lastUpdatedLabel,
    connectionDetails,
    connectionNotice,
    tokenHealth,
    syncSummaries,
    primaryAction,
    showDangerZone: connected,
  };
};
