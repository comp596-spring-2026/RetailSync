import { api } from './client';

export const posApi = {
  importCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pos/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  importFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pos/import-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  importRows: (rows: string[][], hasHeader = true) => api.post('/pos/import-rows', { rows, hasHeader }),
  previewSharedSheetImport: () => api.post('/pos/import/sheets/preview'),
  previewSheet: (payload: { source?: 'service' | 'oauth' | 'file'; tab?: string; maxRows?: number }) =>
    api.post('/pos/import/sheets/preview', payload),
  validateMapping: (payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    validateSample?: boolean;
  }) => api.post('/pos/import/sheets/match', payload),
  commitSharedSheetImport: (payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) => api.post('/pos/import/sheets/commit', payload),
  commitImport: (payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) => api.post('/pos/import/sheets/commit', payload),
  readSheet: (spreadsheetId: string, range: string, authMode: 'service' | 'oauth') =>
    api.get('/sheets/read', { params: { spreadsheetId, range, authMode } }),
  getGoogleConnectUrl: () => api.get('/integrations/google/sheets/start-url'),
  daily: (start: string, end: string) => api.get('/pos/daily', { params: { start, end } })
};
