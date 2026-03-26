import type { QuickBooksSettings } from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import type { QuickBooksOAuthStatus as LegacyQuickBooksOAuthStatus } from '../../settings/components';

type QuickBooksOAuthHealth = {
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

type QuickBooksOAuthStatusDetails = {
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

type QuickBooksWorkspaceState = {
  settings: QuickBooksSettings | null;
  oauthStatus: QuickBooksOAuthStatusDetails | null;
  loading: boolean;
  error: string | null;
};

const defaultState: QuickBooksWorkspaceState = {
  settings: null,
  oauthStatus: null,
  loading: true,
  error: null,
};

const formatQuickBooksReason = (reason: string | null | undefined) => {
  switch (reason) {
    case 'not_connected':
      return 'QuickBooks is not connected';
    case 'quickbooks_secret_missing':
      return 'stored QuickBooks credentials are missing';
    case 'quickbooks_refresh_token_missing':
      return 'the refresh token is missing';
    case 'quickbooks_invalid_grant':
      return 'the QuickBooks connection was revoked or expired';
    case 'quickbooks_invalid_client':
      return 'the QuickBooks app credentials are invalid';
    case 'quickbooks_oauth_not_configured':
      return 'QuickBooks OAuth is not configured';
    case 'encryption_key_missing':
      return 'the encryption key is missing';
    case 'encryption_key_invalid':
      return 'the encryption key is invalid';
    case 'oauth_state_mismatch':
      return 'OAuth state validation failed';
    case 'invalid_oauth_state':
      return 'the OAuth state is invalid';
    default:
      return reason ? reason.replace(/_/g, ' ') : 'the connection needs attention';
  }
};

const normalizeQuickBooksOAuthStatus = (
  oauthStatus:
    | QuickBooksOAuthStatusDetails
    | LegacyQuickBooksOAuthStatus
    | null
    | undefined,
  settings?: QuickBooksSettings | null,
): QuickBooksOAuthStatusDetails | null => {
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
  const needsReconnect = Boolean(
    degraded && oauthStatus.reason && oauthStatus.reason !== 'not_connected',
  );

  return {
    ...oauthStatus,
    connected,
    degraded,
    status: !connected ? 'not_connected' : degraded ? 'degraded' : 'connected',
    needsReconnect,
    health: null,
  };
};

const resolveQuickBooksConnection = (
  settings: QuickBooksSettings | null | undefined,
  oauthStatus: QuickBooksOAuthStatusDetails | null | undefined,
) => {
  const configured = Boolean(settings?.connected);
  const isConnected = oauthStatus != null ? oauthStatus.connected : configured;
  const needsReconnect = Boolean(isConnected && oauthStatus?.needsReconnect);
  const degraded = Boolean(
    isConnected &&
      (oauthStatus?.degraded || needsReconnect || oauthStatus?.health?.status === 'degraded'),
  );

  return {
    isConnected,
    degraded,
    needsReconnect,
  };
};

const getWorkspaceWarning = ({
  connected,
  degraded,
  needsReconnect,
  oauthStatus,
}: {
  connected: boolean;
  degraded: boolean;
  needsReconnect: boolean;
  oauthStatus: QuickBooksOAuthStatusDetails | null;
}) => {
  if (!connected || oauthStatus == null) return null;

  const reasonLabel = formatQuickBooksReason(oauthStatus.reason);
  const lastRefreshError = oauthStatus.health?.lastRefreshError?.trim() || null;

  if (needsReconnect) {
    return `QuickBooks is still connected, but it needs to be reconnected: ${reasonLabel}.`;
  }

  if (!degraded) {
    return null;
  }

  if (lastRefreshError) {
    return `QuickBooks is connected but degraded: ${lastRefreshError}.`;
  }

  return `QuickBooks is connected but degraded: ${reasonLabel}.`;
};

export const useQuickBooksWorkspace = (enabled: boolean) => {
  const [state, setState] = useState<QuickBooksWorkspaceState>(defaultState);

  const load = useCallback(async () => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const settingsResponse = await accountingApi.getQuickbooksSettings();
      let oauthStatus: QuickBooksOAuthStatusDetails | null = null;

      try {
        const statusResponse = await accountingApi.getQuickbooksOAuthStatus();
        oauthStatus = normalizeQuickBooksOAuthStatus(
          statusResponse.data.data,
          settingsResponse.data.data,
        );
      } catch {
        oauthStatus = null;
      }

      setState({
        settings: settingsResponse.data.data,
        oauthStatus,
        loading: false,
        error: null,
      });
    } catch (apiError) {
      setState({
        settings: null,
        oauthStatus: null,
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load QuickBooks workspace'),
      });
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const connection = useMemo(
    () => resolveQuickBooksConnection(state.settings, state.oauthStatus),
    [state.settings, state.oauthStatus],
  );

  const isConnected = connection.isConnected;
  const isDegraded = connection.degraded;
  const needsReconnect = connection.needsReconnect;

  const connectionStatus = useMemo(() => {
    if (!isConnected) return 'not_connected' as const;
    if (needsReconnect || isDegraded) return 'degraded' as const;
    return 'connected' as const;
  }, [isConnected, isDegraded, needsReconnect]);

  const health = useMemo(
    (): QuickBooksOAuthHealth | null => state.oauthStatus?.health ?? null,
    [state.oauthStatus?.health],
  );

  const warning = useMemo(() => {
    return getWorkspaceWarning({
      connected: isConnected,
      degraded: isDegraded,
      needsReconnect,
      oauthStatus: state.oauthStatus,
    });
  }, [isConnected, isDegraded, needsReconnect, state.oauthStatus]);

  return {
    ...state,
    load,
    isConnected,
    isDegraded,
    needsReconnect,
    connectionStatus,
    health,
    warning,
  };
};
