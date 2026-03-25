import { api } from '../../../app/api/client';
import type { GoogleSheetsSyncOverview, QuickBooksOAuthStatus } from '../types';

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

  getGoogleSheetsSummary(connectorKey = 'pos_daily') {
    return api.get('/settings/google-sheets/summary', { params: { connectorKey } });
  }

  stageGoogleSheetsChange(payload: {
    connectorKey: string;
    sourceType: 'oauth' | 'shared';
    sourceId?: string;
    profileId?: string;
    spreadsheetId: string;
    spreadsheetTitle?: string;
    sheetName: string;
    headerRow?: number;
    mapping?: Record<string, string>;
    transformations?: Record<string, unknown>;
  }) {
    return api.post('/settings/google-sheets/stage-change', payload);
  }

  commitGoogleSheetsChange(payload: {
    connectorKey: string;
    sourceType: 'oauth' | 'shared';
    sourceId?: string;
    profileId?: string;
    sourceName?: string;
    profileName?: string;
    spreadsheetId: string;
    spreadsheetTitle?: string;
    sheetName: string;
    headerRow?: number;
    mapping?: Record<string, string>;
    transformations?: Record<string, unknown>;
    mappingConfirmedAt?: string | null;
    mappingHash?: string | null;
    activate?: boolean;
  }) {
    return api.post('/settings/google-sheets/commit-change', payload);
  }

  getGoogleSheetsSyncOverview() {
    return api.get<{
      data: GoogleSheetsSyncOverview;
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

  verifySharedSheet(payload?: { profileId?: string; spreadsheetId?: string; spreadsheetUrl?: string }) {
    return api.post('/settings/google-sheets/shared/verify', payload ?? {});
  }

  saveGoogleSheetsSyncSchedule(payload: { enabled: boolean; hour: number; minute: number; timezone: string }) {
    return api.post('/integrations/sheets/sync-schedule', payload);
  }

  previewSheet(payload: {
    source?: 'service' | 'oauth' | 'file';
    tab?: string;
    maxRows?: number;
    spreadsheetId?: string;
    headerRow?: number;
  }) {
    return api.post('/pos/import/sheets/preview', payload);
  }

  validateGoogleSheetsMapping(payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    validateSample?: boolean;
    tab?: string;
    spreadsheetId?: string;
    headerRow?: number;
  }) {
    return api.post('/pos/import/sheets/match', payload);
  }

  commitGoogleSheetsImport(payload: {
    connectorKey?: string;
    integrationType?: 'oauth' | 'shared';
    sourceId?: string;
    profileId?: string;
    mapping?: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) {
    return api.post('/pos/import/sheets/commit', payload);
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

  getQuickbooksConnectUrl(returnTo = '/dashboard/settings') {
    return api.get<{
      data: {
        url: string;
        environment: QuickbooksEnvironment;
      };
    }>('/integrations/quickbooks/start-url', { params: { returnTo } });
  }

  connectQuickbooks(returnTo = '/dashboard/settings') {
    return api.post<{
      data: {
        url: string;
        environment: QuickbooksEnvironment;
      };
    }>('/settings/quickbooks/connect', { returnTo });
  }

  disconnectQuickbooks() {
    return api.post('/settings/disconnect/quickbooks');
  }

  getQuickbooksOAuthStatus() {
    return api.get<{
      data: QuickBooksOAuthStatus;
    }>('/integrations/quickbooks/oauth-status');
  }

  refreshQuickbooksReferenceData() {
    return api.post('/integrations/quickbooks/sync/refresh-reference-data');
  }

  postApprovedToQuickbooks() {
    return api.post('/integrations/quickbooks/sync/post-approved');
  }
}

export const settingsApi = new SettingsApi();
