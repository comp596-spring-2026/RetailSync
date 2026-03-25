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
      const [settingsResponse, statusResponse] = await Promise.all([
        accountingApi.getQuickbooksSettings(),
        accountingApi.getQuickbooksOAuthStatus()
      ]);

      setState({
        settings: settingsResponse.data.data,
        oauthStatus: statusResponse.data.data,
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
    if (!state.settings?.connected) return false;
    if (state.oauthStatus == null) return true;
    return state.oauthStatus.ok !== false;
  }, [state.oauthStatus, state.settings?.connected]);

  return {
    ...state,
    load,
    isConnected
  };
};
