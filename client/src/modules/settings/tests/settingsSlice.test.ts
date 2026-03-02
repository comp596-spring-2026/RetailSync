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
          googleSheets: {
            mode: 'service_account',
            serviceAccountEmail: 'svc@retailsync.test',
            connected: true,
            connectedEmail: null,
            sources: []
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

    expect(state.settings?.googleSheets.connected).toBe(true);
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
