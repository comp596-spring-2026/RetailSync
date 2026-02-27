import { PermissionsMap } from '@retailsync/shared';
import { api } from '../client';

export class RbacApi {
  modules() {
    return api.get('/roles/modules');
  }

  listRoles() {
    return api.get('/roles');
  }

  createRole(payload: { name: string; permissions: PermissionsMap }) {
    return api.post('/roles', payload);
  }

  updateRole(id: string, payload: { name: string; permissions: PermissionsMap }) {
    return api.put(`/roles/${id}`, payload);
  }

  deleteRole(id: string) {
    return api.delete(`/roles/${id}`);
  }
}

export const rbacApi = new RbacApi();
