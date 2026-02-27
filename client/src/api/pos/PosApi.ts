import { api } from '../client';

export class PosApi {
  importCsv(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pos/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  importFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pos/import-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  importRows(rows: string[][], hasHeader = true) {
    return api.post('/pos/import-rows', { rows, hasHeader });
  }

  previewSharedSheetImport() {
    return api.post('/pos/import/sheets/preview');
  }

  previewSheet(payload: { source?: 'service' | 'oauth' | 'file'; tab?: string; maxRows?: number; spreadsheetId?: string; headerRow?: number }) {
    return api.post('/pos/import/sheets/preview', payload);
  }

  validateMapping(payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    validateSample?: boolean;
    tab?: string;
    spreadsheetId?: string;
    headerRow?: number;
  }) {
    return api.post('/pos/import/sheets/match', payload);
  }

  commitSharedSheetImport(payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) {
    return api.post('/pos/import/sheets/commit', payload);
  }

  commitImport(payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) {
    return api.post('/pos/import/sheets/commit', payload);
  }

  readSheet(spreadsheetId: string, range: string, authMode: 'service' | 'oauth') {
    return api.get('/sheets/read', { params: { spreadsheetId, range, authMode } });
  }

  getGoogleConnectUrl() {
    return api.get('/integrations/google/sheets/start-url');
  }

  daily(start: string, end: string) {
    return api.get('/pos/daily', { params: { start, end } });
  }
}

export const posApi = new PosApi();
