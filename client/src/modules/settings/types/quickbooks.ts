import type { QuickBooksSettings } from '@retailsync/shared';
import type { QuickBooksOAuthStatus as LegacyQuickBooksOAuthStatus } from './integrationStatus';

export type QuickBooksCanonicalSettings = QuickBooksSettings;
export type QuickBooksSyncStatus = QuickBooksSettings['lastPullStatus'];

export type QuickBooksOAuthHealth = {
  status: 'healthy' | 'degraded';
  checkedAt: string;
  refreshedAt: string | null;
  accessTokenExpiresAt: string | null;
  accessTokenExpiresInSec: number | null;
  refreshTokenExpiresAt: string | null;
  refreshTokenExpiresInSec: number | null;
  lastRefreshError: string | null;
  lastRefreshErrorAt: string | null;
};

export type QuickBooksOAuthWorkspaceStatus = {
  ok: boolean;
  reason: string | null;
  connected: boolean;
  degraded: boolean;
  status: 'not_connected' | 'connected' | 'degraded';
  needsReconnect: boolean;
  environment?: 'sandbox' | 'production';
  realmId: string | null;
  companyName: string | null;
  expiresInSec: number | null;
  health: QuickBooksOAuthHealth | null;
};

export type QuickBooksOAuthConnectionStatus = QuickBooksOAuthWorkspaceStatus['status'];
export type QuickBooksOAuthStatusDetails = QuickBooksOAuthWorkspaceStatus;

export type QuickBooksOAuthStatusInput =
  | QuickBooksOAuthWorkspaceStatus
  | LegacyQuickBooksOAuthStatus
  | null
  | undefined;

export type QuickBooksConnectionCondition =
  | 'not_connected'
  | 'healthy'
  | 'degraded'
  | 'needs_reconnect'
  | 'unknown';

export type QuickBooksConnectionAlert = {
  tone: 'warning' | 'error';
  message: string;
};

const FALLBACK_REASON_LABEL = 'QuickBooks needs attention';

export const formatQuickBooksOAuthReason = (reason: string | null | undefined) => {
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
      return reason ? reason.replace(/_/g, ' ') : FALLBACK_REASON_LABEL;
  }
};

export const getQuickBooksAccessTokenExpiresInSec = (
  oauthStatus: QuickBooksOAuthWorkspaceStatus | null | undefined,
) => oauthStatus?.health?.accessTokenExpiresInSec ?? oauthStatus?.expiresInSec ?? null;

export const resolveQuickBooksConnection = (
  settings: QuickBooksSettings | null | undefined,
  oauthStatus: QuickBooksOAuthWorkspaceStatus | null | undefined,
) => {
  const configured = Boolean(settings?.connected);
  const isConnected = oauthStatus != null ? oauthStatus.connected : configured;
  const needsReconnect = Boolean(isConnected && oauthStatus?.needsReconnect);
  const degraded = Boolean(
    isConnected &&
      (oauthStatus?.degraded || needsReconnect || oauthStatus?.health?.status === 'degraded'),
  );

  let condition: QuickBooksConnectionCondition = 'unknown';
  if (!isConnected) {
    condition = 'not_connected';
  } else if (needsReconnect) {
    condition = 'needs_reconnect';
  } else if (degraded) {
    condition = 'degraded';
  } else if (configured || oauthStatus?.connected) {
    condition = 'healthy';
  }

  return {
    configured,
    isConnected,
    degraded,
    needsReconnect,
    condition,
    environment: oauthStatus?.environment ?? settings?.environment,
    realmId: oauthStatus?.realmId?.trim() || settings?.realmId?.trim() || null,
    companyName: oauthStatus?.companyName?.trim() || settings?.companyName?.trim() || null,
    reasonLabel: formatQuickBooksOAuthReason(oauthStatus?.reason),
    health: oauthStatus?.health ?? null,
  };
};

export const getQuickBooksConnectionAlert = (
  oauthStatus: QuickBooksOAuthWorkspaceStatus | null | undefined,
): QuickBooksConnectionAlert | null => {
  if (!oauthStatus?.connected) return null;

  const reasonLabel = formatQuickBooksOAuthReason(oauthStatus.reason);
  const lastRefreshError = oauthStatus.health?.lastRefreshError?.trim() || null;

  if (oauthStatus.needsReconnect) {
    return {
      tone: 'error',
      message: lastRefreshError
        ? `QuickBooks needs to be reconnected: ${reasonLabel}. Last refresh error: ${lastRefreshError}.`
        : `QuickBooks needs to be reconnected: ${reasonLabel}.`,
    };
  }

  if (oauthStatus.degraded || oauthStatus.health?.status === 'degraded') {
    return {
      tone: 'warning',
      message: lastRefreshError
        ? `QuickBooks connection is degraded: ${lastRefreshError}.`
        : `QuickBooks connection is degraded: ${reasonLabel}.`,
    };
  }

  return null;
};

export const normalizeQuickBooksOAuthStatus = (
  oauthStatus: QuickBooksOAuthStatusInput,
  settings?: QuickBooksSettings | null,
): QuickBooksOAuthWorkspaceStatus | null => {
  if (!oauthStatus) return null;

  if ('connected' in oauthStatus) {
    return {
      ...oauthStatus,
      health: oauthStatus.health ?? null,
    };
  }

  const connected = Boolean(
    settings?.connected ||
      (oauthStatus.reason !== 'not_connected' &&
        (oauthStatus.realmId || oauthStatus.companyName || oauthStatus.ok)),
  );
  const degraded = Boolean(connected && oauthStatus.ok === false);
  const needsReconnect = Boolean(degraded && oauthStatus.reason && oauthStatus.reason !== 'not_connected');

  return {
    ...oauthStatus,
    connected,
    degraded,
    status: !connected ? 'not_connected' : degraded ? 'degraded' : 'connected',
    needsReconnect,
    health: null,
  };
};
