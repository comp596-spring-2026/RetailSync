import { describe, expect, it, vi } from 'vitest';
import { api } from '../client';
import { authApi } from './AuthApi';

vi.mock('../client', () => ({
  api: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} }))
  }
}));

describe('AuthApi', () => {
  it('me() calls GET /auth/me', async () => {
    await authApi.me();
    expect(vi.mocked(api.get)).toHaveBeenCalledWith('/auth/me');
  });

  it('logout() calls POST /auth/logout', async () => {
    await authApi.logout();
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/logout');
  });
});
