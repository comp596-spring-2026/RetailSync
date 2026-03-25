import type { QuickBooksSettings } from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import type { QuickBooksOAuthStatus } from '../../settings/components';

type QuickBooksWorkspaceState = {
  settings: QuickBooksSettings | null;
  oauthStatus: QuickBooksOAuthStatus | null;
  loading: boolean;
  error: string | null;
};

const defaultState: QuickBooksWorkspaceState = {
  settings: null,
  oauthStatus: null,
  loading: true,
  error: null
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
      let oauthStatus: QuickBooksOAuthStatus | null = null;

      try {
        const statusResponse = await accountingApi.getQuickbooksOAuthStatus();
        oauthStatus = statusResponse.data.data;
      } catch {
        oauthStatus = null;
      }

      setState({
        settings: settingsResponse.data.data,
        oauthStatus,
        loading: false,
        error: null
      });
    } catch (apiError) {
      setState({
        settings: null,
        oauthStatus: null,
        loading: false,
        error: extractApiErrorMessage(apiError, 'Failed to load QuickBooks workspace')
      });
    }
  }, [enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const isConnected = useMemo(() => {
    return Boolean(state.settings?.connected);
  }, [state.settings?.connected]);

  const warning = useMemo(() => {
    if (!state.settings?.connected) return null;
    if (!state.oauthStatus || state.oauthStatus.ok !== false) return null;
    return state.oauthStatus.reason
      ? `QuickBooks connection needs attention: ${state.oauthStatus.reason.replace(/_/g, ' ')}.`
      : 'QuickBooks OAuth health needs attention, but the company remains connected.';
  }, [state.oauthStatus, state.settings?.connected]);

  return {
    ...state,
    load,
    isConnected,
    warning
  };
};
