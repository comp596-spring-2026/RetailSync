import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import settingsReducer, { fetchOAuthStatus, fetchSettings, setOAuthStatus } from '../state/settingsSlice';
import uiReducer from '../../../app/store/uiSlice';

const mockedSettingsApi = vi.hoisted(() => ({
  get: vi.fn(),
  getGoogleSheetsOAuthStatus: vi.fn()
}));

vi.mock('../api', () => ({
  settingsApi: mockedSettingsApi
}));

describe('settingsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads settings via fetchSettings', async () => {
    mockedSettingsApi.get.mockResolvedValueOnce({
      data: {
        data: {
          id: 'settings-1',
          companyId: 'company-1',
          ownerUserId: 'user-1',
          googleSheets: {
            activeIntegration: 'shared',
            oauth: {
              enabled: true,
              connectionStatus: 'connected',
              activeSourceId: 'source-1',
              activeConnectorKey: 'pos_daily',
              sources: []
            },
            shared: {
              enabled: false,
              activeProfileId: null,
              activeConnectorKey: 'pos_daily',
              profiles: []
            }
          },
          quickbooks: {
            connected: false,
            environment: 'sandbox',
            realmId: null,
            companyName: null
          },
          lastImportSource: null,
          lastImportAt: null
        }
      }
    });

    const store = configureStore({
      reducer: {
        settings: settingsReducer,
        ui: uiReducer
      }
    });

    await store.dispatch(fetchSettings());
    const state = store.getState().settings;

    expect(state.settings?.googleSheets.oauth.connectionStatus).toBe('connected');
    expect(state.loading).toBe(false);
  });

  it('updates oauthStatus for both reducer and thunk path', async () => {
    mockedSettingsApi.getGoogleSheetsOAuthStatus.mockResolvedValueOnce({
      data: { data: { ok: true } }
    });

    const store = configureStore({
      reducer: {
        settings: settingsReducer,
        ui: uiReducer
      }
    });

    store.dispatch(setOAuthStatus('error'));
    expect(store.getState().settings.oauthStatus).toBe('error');

    await store.dispatch(fetchOAuthStatus());
    expect(store.getState().settings.oauthStatus).toBe('ok');
  });
});
