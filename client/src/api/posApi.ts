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
  readSheet: (spreadsheetId: string, range: string, authMode: 'service' | 'oauth') =>
    api.get('/sheets/read', { params: { spreadsheetId, range, authMode } }),
  getGoogleConnectUrl: () => api.get('/google/connect-url'),
  daily: (start: string, end: string) => api.get('/pos/daily', { params: { start, end } })
};
