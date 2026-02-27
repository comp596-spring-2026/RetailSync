import { api } from '../client';

export type CreateItemPayload = {
  upc: string;
  modifier?: string;
  description: string;
  department: string;
  price: number;
  sku?: string;
  defaultLocationCode?: string;
};

export type UpdateItemPayload = Partial<{
  upc: string;
  modifier: string;
  description: string;
  department: string;
  price: number;
  sku: string;
  defaultLocationCode: string;
}>;

export class ItemsApi {
  list(barcode?: string) {
    return api.get('/inventory/items', { params: barcode ? { barcode } : undefined });
  }

  create(payload: CreateItemPayload) {
    return api.post('/inventory/items', payload);
  }

  update(id: string, payload: UpdateItemPayload) {
    return api.put(`/inventory/items/${id}`, payload);
  }

  remove(id: string) {
    return api.delete(`/inventory/items/${id}`);
  }

  importCsv(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/inventory/items/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
}

export const itemsApi = new ItemsApi();

