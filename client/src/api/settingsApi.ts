import { api } from './client';

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

export const settingsApi = {
  get: () => api.get('/settings'),
  getGoogleConnectUrl: () => api.get('/integrations/google/sheets/start-url'),
  listTabs: () => api.get('/integrations/sheets/tabs'),
  configureSharedSheet: (payload: {
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    sheetName?: string;
    headerRow?: number;
    columnsMap?: Record<string, string>;
    enabled?: boolean;
  }) => api.post('/integrations/sheets/config', payload),
  verifySharedSheet: () => api.post('/integrations/sheets/verify'),
  setGoogleMode: (mode: GoogleSheetMode) => api.put('/settings/google-sheets/mode', { mode }),
  saveGoogleSource: (payload: GoogleSheetSource) => api.put('/settings/google-sheets/source', payload),
  testGoogleSheet: (payload: { spreadsheetId: string; range: string; authMode: GoogleSheetMode }) =>
    api.post('/settings/google-sheets/test', payload),
  disconnectGoogle: () => api.post('/settings/disconnect/google'),
  setQuickbooks: (payload: {
    environment?: QuickbooksEnvironment;
    connected?: boolean;
    realmId?: string | null;
    companyName?: string | null;
  }) => api.put('/settings/quickbooks', payload),
  connectQuickbooks: () => api.post('/settings/quickbooks/connect'),
  disconnectQuickbooks: () => api.post('/settings/disconnect/quickbooks')
};
