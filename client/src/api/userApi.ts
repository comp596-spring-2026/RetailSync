import { api } from './client';

export const userApi = {
  listUsers: () => api.get('/users'),
  assignRole: (userId: string, roleId: string) => api.put(`/users/${userId}/role`, { roleId }),
  listInvites: () => api.get('/invites'),
  createInvite: (payload: { email: string; roleId: string; expiresInDays?: number }) => api.post('/invites', payload),
  deleteInvite: (id: string) => api.delete(`/invites/${id}`)
};
