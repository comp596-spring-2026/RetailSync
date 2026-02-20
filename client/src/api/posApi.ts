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
  daily: (start: string, end: string) => api.get('/pos/daily', { params: { start, end } })
};
