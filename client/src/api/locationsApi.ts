import { api } from './client';

export const locationsApi = {
  list: () => api.get('/locations'),
  create: (payload: { code: string; type: 'shelf' | 'fridge' | 'freezer' | 'backroom'; label: string }) =>
    api.post('/locations', payload),
  update: (id: string, payload: Partial<{ code: string; type: 'shelf' | 'fridge' | 'freezer' | 'backroom'; label: string }>) =>
    api.put(`/locations/${id}`, payload),
  remove: (id: string) => api.delete(`/locations/${id}`)
};
