import { api } from '../client';

export type GoogleSheetMode = 'service_account' | 'oauth';
export type QuickbooksEnvironment = 'sandbox' | 'production';

export type GoogleSheetSource = {
  sourceId?: string;
  name: string;
  spreadsheetId: string;
  sheetGid?: string | null;
  range: string;
  mapping?: Record<string, string>;
  active?: boolean;
};

export class SettingsApi {
  get() {
    return api.get('/settings');
  }

  getGoogleConnectUrl() {
    return api.get('/integrations/google/sheets/start-url');
  }

  listOAuthSpreadsheets() {
    return api.get('/integrations/google/sheets/files');
  }

  listTabs() {
    return api.get('/integrations/sheets/tabs');
  }

  configureSharedSheet(payload: {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheetName?: string;
    headerRow?: number;
    columnsMap?: Record<string, string>;
    enabled?: boolean;
  }) {
    return api.post('/integrations/sheets/config', payload);
  }

  verifySharedSheet() {
    return api.post('/integrations/sheets/verify');
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
