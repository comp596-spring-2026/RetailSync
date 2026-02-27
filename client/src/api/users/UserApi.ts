import { api } from '../client';

export class UserApi {
  listUsers() {
    return api.get('/users');
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
