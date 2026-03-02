import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { settingsApi } from '../api';
import type { RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';

export type GoogleSheetsSettings = {
  mode: 'service_account' | 'oauth';
  serviceAccountEmail: string;
  connected: boolean;
  connectedEmail: string | null;
  syncSchedule?: {
    enabled: boolean;
    hour: number;
    minute: number;
    timezone: string;
  };
  lastScheduledSyncAt?: string | null;
  sources: Array<{
    sourceId: string;
    name: string;
    spreadsheetTitle?: string | null;
    spreadsheetId: string;
    sheetGid: string | null;
    range: string;
    mapping: Record<string, string>;
    transformations?: Record<string, unknown>;
    active: boolean;
  }>;
  sharedSheets?: Array<{
    profileId: string;
    name: string;
    spreadsheetId: string | null;
    spreadsheetTitle?: string | null;
    sheetName: string;
    headerRow: number;
    enabled: boolean;
    shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
    lastVerifiedAt?: string | null;
    lastImportAt?: string | null;
    columnsMap?: Record<string, string>;
    lastMapping?: {
      columnsMap?: Record<string, string>;
      transformations?: Record<string, unknown>;
      createdAt?: string | null;
      createdBy?: string | null;
    } | null;
    isDefault?: boolean;
  }>;
  sharedConfig?: {
    spreadsheetId: string | null;
    spreadsheetTitle?: string | null;
    sheetName: string;
    headerRow: number;
    enabled: boolean;
    shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
    lastVerifiedAt?: string | null;
    lastImportAt?: string | null;
    availableTabs?: Array<{ sheetId: number; sheetName: string }>;
    columnsMap?: Record<string, string>;
    lastMapping?: {
      columnsMap?: Record<string, string>;
      transformations?: Record<string, unknown>;
      createdAt?: string | null;
      createdBy?: string | null;
    } | null;
  };
};

export type IntegrationSettings = {
  googleSheets: GoogleSheetsSettings;
  quickbooks: {
    connected: boolean;
    environment: 'sandbox' | 'production';
    realmId: string | null;
    companyName: string | null;
  };
  lastImportSource?: 'file' | 'google_sheets' | null;
  lastImportAt?: string | null;
};

type SettingsState = {
  settings: IntegrationSettings | null;
  loading: boolean;
  error: string | null;
  oauthStatus: 'ok' | 'error' | null;
  isBusy: boolean;
};

const initialState: SettingsState = {
  settings: null,
  loading: false,
  error: null,
  oauthStatus: null,
  isBusy: false
};

export const fetchSettings = createAsyncThunk<IntegrationSettings>(
  'settings/fetch',
  async () => {
    const res = await settingsApi.get();
    return res.data.data as IntegrationSettings;
  }
);

export const fetchOAuthStatus = createAsyncThunk<'ok' | 'error'>(
  'settings/fetchOAuthStatus',
  async (_, { rejectWithValue }) => {
    try {
      const r = await settingsApi.getGoogleSheetsOAuthStatus();
      const ok = (r.data as { data?: { ok?: boolean } })?.data?.ok;
      return ok === true ? 'ok' : 'error';
    } catch {
      return rejectWithValue('error');
    }
  }
);

export const setGoogleModeThunk = createAsyncThunk<void, 'oauth' | 'service_account'>(
  'settings/setGoogleMode',
  async (mode, { dispatch }) => {
    await settingsApi.setGoogleMode(mode);
    dispatch(showSnackbar({ message: 'Google mode updated', severity: 'success' }));
    await dispatch(fetchSettings());
  }
);

export const configureSharedSheetThunk = createAsyncThunk<
  void,
  { profileId?: string; profileName?: string; spreadsheetId?: string; sheetName?: string; headerRow?: number; enabled?: boolean }
>(
  'settings/configureSharedSheet',
  async (payload, { dispatch, rejectWithValue }) => {
    try {
      await settingsApi.configureSharedSheet(payload);
      dispatch(showSnackbar({ message: 'Shared sheet config saved', severity: 'success' }));
      await dispatch(fetchSettings());
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to save';
      return rejectWithValue(msg);
    }
  }
);

export const verifySharedSheetThunk = createAsyncThunk<void, { profileId?: string } | undefined>(
  'settings/verifySharedSheet',
  async (payload, { dispatch }) => {
    await settingsApi.verifySharedSheet(payload);
    dispatch(showSnackbar({ message: 'Shared sheet verified', severity: 'success' }));
    await dispatch(fetchSettings());
  }
);

export const resetGoogleSheetsThunk = createAsyncThunk<void>(
  'settings/resetGoogleSheets',
  async (_, { dispatch }) => {
    await settingsApi.resetGoogleSheets();
    await dispatch(fetchSettings());
  }
);

export const disconnectGoogleThunk = createAsyncThunk<void>(
  'settings/disconnectGoogle',
  async (_, { dispatch }) => {
    await settingsApi.disconnectGoogle();
    await dispatch(fetchSettings());
  }
);

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setOAuthStatus(state, action: PayloadAction<'ok' | 'error' | null>) {
      state.oauthStatus = action.payload;
    },
    setSettingsError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    clearSettingsError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action: PayloadAction<IntegrationSettings>) => {
        state.loading = false;
        state.settings = action.payload;
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? 'Failed to load settings';
      })
      .addCase(fetchOAuthStatus.fulfilled, (state, action: PayloadAction<'ok' | 'error'>) => {
        state.oauthStatus = action.payload;
      })
      .addCase(fetchOAuthStatus.rejected, (state) => {
        state.oauthStatus = 'error';
      })
      .addCase(setGoogleModeThunk.pending, (state) => { state.isBusy = true; })
      .addCase(setGoogleModeThunk.fulfilled, (state) => { state.isBusy = false; })
      .addCase(setGoogleModeThunk.rejected, (state) => { state.isBusy = false; })
      .addCase(configureSharedSheetThunk.pending, (state) => { state.isBusy = true; })
      .addCase(configureSharedSheetThunk.fulfilled, (state) => { state.isBusy = false; })
      .addCase(configureSharedSheetThunk.rejected, (state) => { state.isBusy = false; })
      .addCase(verifySharedSheetThunk.pending, (state) => { state.isBusy = true; })
      .addCase(verifySharedSheetThunk.fulfilled, (state) => { state.isBusy = false; })
      .addCase(verifySharedSheetThunk.rejected, (state) => { state.isBusy = false; })
      .addCase(resetGoogleSheetsThunk.pending, (state) => { state.isBusy = true; })
      .addCase(resetGoogleSheetsThunk.fulfilled, (state) => { state.isBusy = false; })
      .addCase(resetGoogleSheetsThunk.rejected, (state) => { state.isBusy = false; })
      .addCase(disconnectGoogleThunk.pending, (state) => { state.isBusy = true; })
      .addCase(disconnectGoogleThunk.fulfilled, (state) => { state.isBusy = false; })
      .addCase(disconnectGoogleThunk.rejected, (state) => { state.isBusy = false; });
  }
});

export const { setOAuthStatus, setSettingsError, clearSettingsError } = settingsSlice.actions;

const settingsState = (state: RootState) => (state as unknown as { settings?: SettingsState }).settings;

export const selectSettings = (state: RootState) => settingsState(state)?.settings ?? null;
export const selectSettingsLoading = (state: RootState) => settingsState(state)?.loading ?? false;
export const selectSettingsError = (state: RootState) => settingsState(state)?.error ?? null;
export const selectOAuthStatus = (state: RootState) => settingsState(state)?.oauthStatus ?? null;
export const selectSettingsIsBusy = (state: RootState) => settingsState(state)?.isBusy ?? false;

export default settingsSlice.reducer;
