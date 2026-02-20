import { api } from './client';

export const itemsApi = {
  list: (barcode?: string) => api.get('/items', { params: barcode ? { barcode } : undefined }),
  create: (payload: {
    upc: string;
    modifier?: string;
    description: string;
    department: string;
    price: number;
    sku?: string;
    defaultLocationCode?: string;
  }) => api.post('/items', payload),
  update: (
    id: string,
    payload: Partial<{
      upc: string;
      modifier: string;
      description: string;
      department: string;
      price: number;
      sku: string;
      defaultLocationCode: string;
    }>
  ) => api.put(`/items/${id}`, payload),
  remove: (id: string) => api.delete(`/items/${id}`),
  importCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/items/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};
