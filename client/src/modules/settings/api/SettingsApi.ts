import { api } from '../../../app/api/client';

export type GoogleSheetMode = 'service_account' | 'oauth';
export type QuickbooksEnvironment = 'sandbox' | 'production';

export type GoogleSheetSource = {
  sourceId?: string;
  name: string;
  spreadsheetTitle?: string | null;
  spreadsheetId: string;
  sheetGid?: string | null;
  range: string;
  mapping?: Record<string, string>;
  transformations?: Record<string, unknown>;
  active?: boolean;
};

export class SettingsApi {
  get() {
    return api.get('/settings');
  }

  getGoogleSheetsSyncOverview() {
    return api.get<{
      data: {
        totalEntries: number;
        lastUpdatedAt: string | null;
        byProfile: Array<{
          profileName: string;
          entries: number;
          lastUpdatedAt: string | null;
        }>;
      };
    }>('/settings/google-sheets/sync-overview');
  }

  getGoogleConnectUrl() {
    return api.get('/integrations/google/sheets/start-url');
  }

  listOAuthSpreadsheets() {
    return api.get('/integrations/google/sheets/files');
  }

  /** Check if OAuth tokens are still valid (for "Working" vs "Re-authorization needed"). */
  getGoogleSheetsOAuthStatus() {
    return api.get<{
      data: { ok: boolean; reason: string | null; email: string | null };
    }>('/integrations/google/sheets/oauth-status');
  }

  /** List spreadsheets shared with the service account (Shared Sheet flow). */
  listSharedSpreadsheets() {
    return api.get<{ data: { files: Array<{ id: string; name: string; modifiedTime: string | null }> } }>(
      '/integrations/sheets/shared-files'
    );
  }

  listTabs() {
    return api.get('/integrations/sheets/tabs');
  }

  /** Load tabs with optional spreadsheetId override (e.g. OAuth-selected sheet). */
  listTabsWithSpreadsheetId(payload: { spreadsheetId?: string; authMode?: GoogleSheetMode }) {
    return api.post('/integrations/sheets/tabs', payload);
  }

  saveGoogleSheetsMapping(payload: {
    mode: 'oauth' | 'service_account';
    sourceId?: string;
    profileId?: string;
    profileName?: string;
    columnsMap: Record<string, string>;
    transformations?: Record<string, unknown>;
  }) {
    return api.post('/integrations/sheets/save-mapping', payload);
  }

  configureSharedSheet(payload: {
    profileId?: string;
    profileName?: string;
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheetName?: string;
    headerRow?: number;
    columnsMap?: Record<string, string>;
    enabled?: boolean;
  }) {
    return api.post('/integrations/sheets/config', payload);
  }

  verifySharedSheet(payload?: { profileId?: string }) {
    return api.post('/integrations/sheets/verify', payload ?? {});
  }

  saveGoogleSheetsSyncSchedule(payload: { enabled: boolean; hour: number; minute: number; timezone: string }) {
    return api.post('/integrations/sheets/sync-schedule', payload);
  }

  deleteGoogleSheetsSourceBinding(payload: {
    mode: 'oauth' | 'service_account';
    profileId?: string;
    profileName?: string;
    sourceId?: string;
    deleteType: 'soft' | 'hard';
    confirmText: string;
  }) {
    return api.post('/integrations/sheets/delete-source', payload);
  }

  setGoogleMode(mode: GoogleSheetMode) {
    return api.put('/settings/google-sheets/mode', { mode });
  }

  saveGoogleSource(payload: GoogleSheetSource) {
    return api.put('/settings/google-sheets/source', payload);
  }

  testGoogleSheet(payload: { spreadsheetId: string; range: string; authMode: GoogleSheetMode }) {
    return api.post('/settings/google-sheets/test', payload);
  }

  disconnectGoogle() {
    return api.post('/settings/disconnect/google');
  }

  resetGoogleSheets() {
    return api.post('/settings/google-sheets/reset');
  }

  setQuickbooks(payload: {
    environment?: QuickbooksEnvironment;
    connected?: boolean;
    realmId?: string | null;
    companyName?: string | null;
  }) {
    return api.put('/settings/quickbooks', payload);
  }

  connectQuickbooks() {
    return api.post('/settings/quickbooks/connect');
  }

  disconnectQuickbooks() {
    return api.post('/settings/disconnect/quickbooks');
  }
}

export const settingsApi = new SettingsApi();
