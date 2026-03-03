import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { settingsApi } from '../api';
import type { RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';
import type { GoogleSheetsCanonicalSettings, IntegrationSettingsCanonical } from '../types/googleSheets';

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
    connectorLabel?: string;
    spreadsheetTitle?: string | null;
    spreadsheetId: string;
    sheetGid: string | null;
    range: string;
    mapping: Record<string, string>;
    transformations?: Record<string, unknown>;
    mappingConfirmedAt?: string | null;
    mappingHash?: string | null;
    active: boolean;
  }>;
  sharedSheets?: Array<{
    profileId: string;
    name: string;
    connectorLabel?: string;
    spreadsheetId: string | null;
    spreadsheetTitle?: string | null;
    sheetName: string;
    headerRow: number;
    enabled: boolean;
    shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
    lastVerifiedAt?: string | null;
    lastImportAt?: string | null;
    columnsMap?: Record<string, string>;
    mappingConfirmedAt?: string | null;
    mappingHash?: string | null;
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

const DEFAULT_GOOGLE_SHEETS_SETTINGS: GoogleSheetsSettings = {
  mode: 'service_account',
  serviceAccountEmail: '',
  connected: false,
  connectedEmail: null,
  sources: [],
  sharedSheets: [],
  sharedConfig: {
    spreadsheetId: null,
    sheetName: 'Sheet1',
    headerRow: 1,
    enabled: false,
    columnsMap: {},
    lastMapping: null,
  },
};

const asStringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, String(item ?? '')]),
  );
};

const connectorLabelFallback = (key: string) => {
  if (key === 'pos_daily') return 'POS Daily Summary';
  return key || 'Connector';
};

const normalizeCanonicalGoogleSheetsSettings = (raw: unknown): GoogleSheetsCanonicalSettings => {
  const gs = (raw ?? {}) as Record<string, unknown>;
  const oauth = (gs.oauth ?? {}) as Record<string, unknown>;
  const shared = (gs.shared ?? {}) as Record<string, unknown>;

  const normalizeConnector = (entry: unknown) => {
    const connector = (entry ?? {}) as Record<string, unknown>;
    return {
      key: String(connector.key ?? 'pos_daily'),
      label: String(connector.label ?? connectorLabelFallback(String(connector.key ?? 'pos_daily'))),
      enabled: Boolean(connector.enabled ?? true),
      spreadsheetId: String(connector.spreadsheetId ?? ''),
      spreadsheetTitle: connector.spreadsheetTitle == null ? null : String(connector.spreadsheetTitle),
      sheetName: String(connector.sheetName ?? 'Sheet1'),
      headerRow: Number(connector.headerRow ?? 1),
      mapping: asStringRecord(connector.mapping),
      transformations:
        connector.transformations && typeof connector.transformations === 'object'
          ? (connector.transformations as Record<string, unknown>)
          : {},
      lastImportAt: connector.lastImportAt == null ? null : String(connector.lastImportAt),
      mappingConfirmedAt: connector.mappingConfirmedAt == null ? null : String(connector.mappingConfirmedAt),
      mappingHash: connector.mappingHash == null ? null : String(connector.mappingHash),
      createdAt: connector.createdAt == null ? null : String(connector.createdAt),
      updatedAt: connector.updatedAt == null ? null : String(connector.updatedAt),
    };
  };

  return {
    activeIntegration:
      gs.activeIntegration === 'oauth'
        ? 'oauth'
        : gs.activeIntegration === 'shared'
          ? 'shared'
          : null,
    oauth: {
      enabled: Boolean(oauth.enabled),
      connectionStatus:
        oauth.connectionStatus === 'connected'
          ? 'connected'
          : oauth.connectionStatus === 'error'
            ? 'error'
            : 'not_connected',
      activeSourceId: oauth.activeSourceId == null ? null : String(oauth.activeSourceId),
      activeConnectorKey: oauth.activeConnectorKey == null ? null : String(oauth.activeConnectorKey),
      sources: (Array.isArray(oauth.sources) ? oauth.sources : []).map((source) => {
        const src = (source ?? {}) as Record<string, unknown>;
        return {
          id: String(src.id ?? src._id ?? ''),
          name: String(src.name ?? ''),
          connectors: (Array.isArray(src.connectors) ? src.connectors : []).map(normalizeConnector),
          lastDebugResult: src.lastDebugResult ?? null,
          createdAt: src.createdAt == null ? null : String(src.createdAt),
          updatedAt: src.updatedAt == null ? null : String(src.updatedAt),
        };
      }),
      lastDebugResult: oauth.lastDebugResult ?? null,
      lastImportAt: oauth.lastImportAt == null ? null : String(oauth.lastImportAt),
    },
    shared: {
      enabled: Boolean(shared.enabled),
      activeProfileId: shared.activeProfileId == null ? null : String(shared.activeProfileId),
      activeConnectorKey: shared.activeConnectorKey == null ? null : String(shared.activeConnectorKey),
      profiles: (Array.isArray(shared.profiles) ? shared.profiles : []).map((profile) => {
        const p = (profile ?? {}) as Record<string, unknown>;
        return {
          id: String(p.id ?? p._id ?? ''),
          name: String(p.name ?? ''),
          connectors: (Array.isArray(p.connectors) ? p.connectors : []).map(normalizeConnector),
          lastDebugResult: p.lastDebugResult ?? null,
          createdAt: p.createdAt == null ? null : String(p.createdAt),
          updatedAt: p.updatedAt == null ? null : String(p.updatedAt),
        };
      }),
      lastDebugResult: shared.lastDebugResult ?? null,
      lastImportAt: shared.lastImportAt == null ? null : String(shared.lastImportAt),
      lastScheduledSyncAt: shared.lastScheduledSyncAt == null ? null : String(shared.lastScheduledSyncAt),
    },
    updatedAt: gs.updatedAt == null ? null : String(gs.updatedAt),
  };
};

const normalizeGoogleSheetsSettings = (raw: unknown): GoogleSheetsSettings => {
  const gs = (raw ?? null) as Record<string, unknown> | null;
  if (!gs || typeof gs !== 'object') return DEFAULT_GOOGLE_SHEETS_SETTINGS;

  // Prefer connector-first model whenever it is present, even if legacy keys still exist.
  const hasConnectorShape =
    'activeIntegration' in gs || 'oauth' in gs || 'shared' in gs;

  const hasLegacyKeys =
    'mode' in gs || 'sources' in gs || 'sharedSheets' in gs || 'sharedConfig' in gs;

  if (!hasConnectorShape && hasLegacyKeys) {
    const legacy = gs as Partial<GoogleSheetsSettings>;
    return {
      mode: legacy.mode === 'oauth' ? 'oauth' : 'service_account',
      serviceAccountEmail: typeof legacy.serviceAccountEmail === 'string' ? legacy.serviceAccountEmail : '',
      connected: Boolean(legacy.connected),
      connectedEmail:
        typeof legacy.connectedEmail === 'string' || legacy.connectedEmail === null
          ? legacy.connectedEmail
          : null,
      syncSchedule: legacy.syncSchedule,
      lastScheduledSyncAt:
        typeof legacy.lastScheduledSyncAt === 'string' || legacy.lastScheduledSyncAt === null
          ? legacy.lastScheduledSyncAt
          : null,
      sources: Array.isArray(legacy.sources) ? legacy.sources : [],
      sharedSheets: Array.isArray(legacy.sharedSheets) ? legacy.sharedSheets : [],
      sharedConfig: legacy.sharedConfig ?? DEFAULT_GOOGLE_SHEETS_SETTINGS.sharedConfig,
    };
  }

  const next = gs as {
    activeIntegration?: unknown;
    oauth?: Record<string, unknown>;
    shared?: Record<string, unknown>;
    serviceAccountEmail?: unknown;
  };

  const oauth = (next.oauth ?? {}) as Record<string, unknown>;
  const shared = (next.shared ?? {}) as Record<string, unknown>;
  const activeIntegration = next.activeIntegration === 'oauth' ? 'oauth' : 'service_account';

  const activeOauthConnectorKey = String(oauth.activeConnectorKey ?? 'pos_daily');
  const activeSharedConnectorKey = String(shared.activeConnectorKey ?? 'pos_daily');
  const activeSourceId = String(oauth.activeSourceId ?? '');
  const activeProfileId = String(shared.activeProfileId ?? '');

  const oauthSourcesRaw = Array.isArray(oauth.sources) ? oauth.sources : [];
  const sharedProfilesRaw = Array.isArray(shared.profiles) ? shared.profiles : [];
  const pickConnector = (
    connectors: unknown[],
    activeKey: string,
  ): Record<string, unknown> => {
    const normalizedKey = String(activeKey ?? '').trim();
    const hasActiveKey = normalizedKey.length > 0;
    const byActive =
      hasActiveKey
        ? connectors.find(
            (entry) => String((entry as Record<string, unknown>)?.key ?? '').trim() === normalizedKey,
          )
        : null;
    if (byActive) return byActive as Record<string, unknown>;

    const byDefault = connectors.find(
      (entry) => String((entry as Record<string, unknown>)?.key ?? '').trim() === 'pos_daily',
    );
    if (byDefault) return byDefault as Record<string, unknown>;

    // Do not silently fall back to connectors[0] when active connector key exists.
    if (hasActiveKey) return {};
    return (connectors[0] ?? {}) as Record<string, unknown>;
  };

  const sources: GoogleSheetsSettings['sources'] = oauthSourcesRaw.map((source) => {
    const src = (source ?? {}) as Record<string, unknown>;
    const sourceId = String(src.id ?? src._id ?? '');
    const sourceName = String(src.name ?? 'POS DATA SHEET');
    const connectors = Array.isArray(src.connectors) ? src.connectors : [];
    const cfg = pickConnector(connectors, activeOauthConnectorKey);
    const sheetName = String(cfg.sheetName ?? 'Sheet1') || 'Sheet1';

    return {
      sourceId,
      name: sourceName,
      connectorLabel: String(cfg.label ?? connectorLabelFallback(String(cfg.key ?? 'pos_daily'))),
      spreadsheetTitle: cfg.spreadsheetTitle ? String(cfg.spreadsheetTitle) : null,
      spreadsheetId: String(cfg.spreadsheetId ?? ''),
      sheetGid: null,
      range: `${sheetName}!A1:Z`,
      mapping: asStringRecord(cfg.mapping),
      transformations:
        cfg.transformations && typeof cfg.transformations === 'object'
          ? (cfg.transformations as Record<string, unknown>)
          : {},
      mappingConfirmedAt: cfg.mappingConfirmedAt == null ? null : String(cfg.mappingConfirmedAt),
      mappingHash: cfg.mappingHash == null ? null : String(cfg.mappingHash),
      active: Boolean(activeSourceId && sourceId && activeSourceId === sourceId),
    };
  });

  const sharedSheets: NonNullable<GoogleSheetsSettings['sharedSheets']> = sharedProfilesRaw.map((profile) => {
    const p = (profile ?? {}) as Record<string, unknown>;
    const profileId = String(p.id ?? p._id ?? '');
    const profileName = String(p.name ?? 'POS DATA SHEET');
    const connectors = Array.isArray(p.connectors) ? p.connectors : [];
    const cfg = pickConnector(connectors, activeSharedConnectorKey);
    const mapping = asStringRecord(cfg.mapping);
    const transformations =
      cfg.transformations && typeof cfg.transformations === 'object'
        ? (cfg.transformations as Record<string, unknown>)
        : {};
    const lastImportAt = cfg.lastImportAt == null ? null : String(cfg.lastImportAt);

    return {
      profileId,
      name: profileName,
      connectorLabel: String(cfg.label ?? connectorLabelFallback(String(cfg.key ?? 'pos_daily'))),
      spreadsheetId: cfg.spreadsheetId ? String(cfg.spreadsheetId) : null,
      spreadsheetTitle: cfg.spreadsheetTitle ? String(cfg.spreadsheetTitle) : null,
      sheetName: String(cfg.sheetName ?? 'Sheet1') || 'Sheet1',
      headerRow: Number(cfg.headerRow ?? 1),
      enabled: Boolean(cfg.enabled ?? true),
      shareStatus: 'unknown',
      lastVerifiedAt: null,
      lastImportAt,
      columnsMap: mapping,
      mappingConfirmedAt: cfg.mappingConfirmedAt == null ? null : String(cfg.mappingConfirmedAt),
      mappingHash: cfg.mappingHash == null ? null : String(cfg.mappingHash),
      lastMapping: {
        columnsMap: mapping,
        transformations,
        createdAt: null,
        createdBy: null,
      },
      isDefault: Boolean(activeProfileId && profileId && activeProfileId === profileId),
    };
  });

  const activeSharedProfile =
    sharedSheets.find((sheet) => sheet.isDefault) ??
    sharedSheets[0] ??
    null;

  return {
    mode: activeIntegration,
    serviceAccountEmail: typeof next.serviceAccountEmail === 'string' ? next.serviceAccountEmail : '',
    connected: String(oauth.connectionStatus ?? '') === 'connected',
    connectedEmail: null,
    syncSchedule: undefined,
    lastScheduledSyncAt:
      typeof shared.lastScheduledSyncAt === 'string' || shared.lastScheduledSyncAt === null
        ? (shared.lastScheduledSyncAt as string | null)
        : null,
    sources,
    sharedSheets,
    sharedConfig: activeSharedProfile
      ? {
          spreadsheetId: activeSharedProfile.spreadsheetId,
          spreadsheetTitle: activeSharedProfile.spreadsheetTitle,
          sheetName: activeSharedProfile.sheetName,
          headerRow: activeSharedProfile.headerRow,
          enabled: activeSharedProfile.enabled,
          shareStatus: activeSharedProfile.shareStatus,
          lastVerifiedAt: activeSharedProfile.lastVerifiedAt,
          lastImportAt: activeSharedProfile.lastImportAt,
          columnsMap: activeSharedProfile.columnsMap,
          lastMapping: activeSharedProfile.lastMapping,
        }
      : DEFAULT_GOOGLE_SHEETS_SETTINGS.sharedConfig,
  };
};

const normalizeIntegrationSettingsCanonical = (raw: unknown): IntegrationSettingsCanonical => {
  const settings = (raw ?? {}) as Record<string, unknown>;
  const quickbooks = (settings.quickbooks ?? {}) as Record<string, unknown>;
  const lastImportSourceRaw = settings.lastImportSource;

  return {
    id: settings.id == null ? '' : String(settings.id),
    companyId: settings.companyId == null ? '' : String(settings.companyId),
    ownerUserId: settings.ownerUserId == null ? '' : String(settings.ownerUserId),
    googleSheets: normalizeCanonicalGoogleSheetsSettings(settings.googleSheets),
    quickbooks: {
      connected: Boolean(quickbooks.connected),
      environment: quickbooks.environment === 'production' ? 'production' : 'sandbox',
      realmId: quickbooks.realmId == null ? null : String(quickbooks.realmId),
      companyName: quickbooks.companyName == null ? null : String(quickbooks.companyName),
    },
    lastImportSource:
      lastImportSourceRaw === 'file' || lastImportSourceRaw === 'google_sheets'
        ? lastImportSourceRaw
        : null,
    lastImportAt: settings.lastImportAt == null ? null : String(settings.lastImportAt),
    createdAt: settings.createdAt == null ? undefined : String(settings.createdAt),
    updatedAt: settings.updatedAt == null ? undefined : String(settings.updatedAt),
  };
};

type SettingsState = {
  settings: IntegrationSettingsCanonical | null;
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

export const fetchSettings = createAsyncThunk<IntegrationSettingsCanonical>(
  'settings/fetch',
  async () => {
    const res = await settingsApi.get();
    return normalizeIntegrationSettingsCanonical(res.data.data);
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
      .addCase(fetchSettings.fulfilled, (state, action: PayloadAction<IntegrationSettingsCanonical>) => {
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

export const selectSettings = (state: RootState): IntegrationSettings | null => {
  const canonical = settingsState(state)?.settings;
  if (!canonical) return null;
  return {
    googleSheets: normalizeGoogleSheetsSettings(canonical.googleSheets),
    quickbooks: canonical.quickbooks,
    lastImportSource: canonical.lastImportSource ?? null,
    lastImportAt: canonical.lastImportAt ?? null,
  };
};
export const selectSettingsLoading = (state: RootState) => settingsState(state)?.loading ?? false;
export const selectSettingsError = (state: RootState) => settingsState(state)?.error ?? null;
export const selectOAuthStatus = (state: RootState) => settingsState(state)?.oauthStatus ?? null;
export const selectSettingsIsBusy = (state: RootState) => settingsState(state)?.isBusy ?? false;

export default settingsSlice.reducer;
