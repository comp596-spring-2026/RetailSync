import { api } from '../../../app/api/client';

export class AuthApi {
  me() {
    return api.get('/auth/me');
  }

  logout() {
    return api.post('/auth/logout');
  }
}

export const authApi = new AuthApi();
