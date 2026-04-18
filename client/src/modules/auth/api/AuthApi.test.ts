import { describe, expect, it, vi } from 'vitest';
import { api } from '../../../app/api/client';
import { authApi } from './AuthApi';

vi.mock('../../../app/api/client', () => ({
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

  it('register() calls POST /auth/register', async () => {
    await authApi.register({
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      password: 'password123'
    });
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/register', {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      password: 'password123'
    });
  });

  it('login() calls POST /auth/login', async () => {
    await authApi.login({ email: 'user@retailsync.com', password: 'password123' });
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/login', {
      email: 'user@retailsync.com',
      password: 'password123'
    });
  });

  it('forgotPassword() calls POST /auth/forgot-password', async () => {
    await authApi.forgotPassword({ email: 'user@retailsync.com' });
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/forgot-password', { email: 'user@retailsync.com' });
  });

  it('resetPassword() calls POST /auth/reset-password', async () => {
    await authApi.resetPassword({ token: 'reset-token', password: 'password123' });
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/reset-password', { token: 'reset-token', password: 'password123' });
  });

  it('requestEmailVerification() calls POST /auth/verify-email/request', async () => {
    await authApi.requestEmailVerification({ email: 'user@retailsync.com' });
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/verify-email/request', { email: 'user@retailsync.com' });
  });

  it('confirmEmailVerification() calls POST /auth/verify-email/confirm', async () => {
    await authApi.confirmEmailVerification({ token: 'verify-token' });
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/verify-email/confirm', { token: 'verify-token' });
  });

  it('logout() calls POST /auth/logout', async () => {
    await authApi.logout();
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/auth/logout');
  });
});
