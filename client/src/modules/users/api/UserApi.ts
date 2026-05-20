import { api } from '../../../app/api/client';

export class UserApi {
  listUsers() {
    return api.get('/users');
  }

  updateUser(userId: string, payload: { firstName: string; lastName: string }) {
    return api.put(`/users/${userId}`, payload);
  }

  deleteUser(userId: string) {
    return api.delete(`/users/${userId}`);
  }

  assignRole(userId: string, roleId: string) {
    return api.put(`/users/${userId}/role`, { roleId });
  }

  listInvites() {
    return api.get('/invites');
  }

  createInvite(payload: { email: string; roleId: string; expiresInDays?: number }) {
    return api.post('/invites', payload);
  }

  deleteInvite(id: string) {
    return api.delete(`/invites/${id}`);
  }
}

export const userApi = new UserApi();
