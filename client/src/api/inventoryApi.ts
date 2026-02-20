import { api } from './client';

export const inventoryApi = {
  move: (payload: { itemId: string; fromLocationCode: string; toLocationCode: string; qty: number; notes?: string }) =>
    api.post('/inventory/move', payload),
  byLocation: (code: string) => api.get(`/inventory/location/${encodeURIComponent(code)}`)
};
