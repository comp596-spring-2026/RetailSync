import { PermissionsMap } from '@retailsync/shared';
import { api } from './client';

export const rbacApi = {
  modules: () => api.get('/roles/modules'),
  listRoles: () => api.get('/roles'),
  createRole: (payload: { name: string; permissions: PermissionsMap }) => api.post('/roles', payload),
  updateRole: (id: string, payload: { name: string; permissions: PermissionsMap }) => api.put(`/roles/${id}`, payload),
  deleteRole: (id: string) => api.delete(`/roles/${id}`)
};
