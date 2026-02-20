import { api } from './client';

export const authApi = {
  register: (payload: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }) => api.post('/auth/register', payload),
  login: (payload: { email: string; password: string }) => api.post('/auth/login', payload),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout')
};
