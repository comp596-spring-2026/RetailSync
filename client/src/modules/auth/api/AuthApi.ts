import { api } from '../../../app/api/client';

export type AuthSessionResponse = {
  accessToken?: string;
  message?: string;
  company?: { _id: string } | null;
  requiresVerification?: boolean;
  email?: string;
};

export type AuthLoginPayload = {
  email: string;
  password: string;
};

export type AuthRegisterPayload = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type AuthInviteLookupPayload = {
  email: string;
  inviteCode: string;
};

export type AuthInviteAcceptPayload = {
  firstName: string;
  lastName: string;
  email: string;
  inviteCode: string;
  password: string;
};

export type AuthEmailPayload = {
  email: string;
};

export type AuthResetPasswordPayload = {
  token: string;
  password: string;
};

export type AuthVerifyEmailPayload = {
  token: string;
};

export class AuthApi {
  me() {
    return api.get('/auth/me');
  }

  register(payload: AuthRegisterPayload) {
    return api.post('/auth/register', payload);
  }

  getInvite(payload: AuthInviteLookupPayload) {
    return api.get('/auth/invite', { params: payload });
  }

  acceptInvite(payload: AuthInviteAcceptPayload) {
    return api.post('/auth/invite/accept', payload);
  }

  login(payload: AuthLoginPayload) {
    return api.post('/auth/login', payload);
  }

  forgotPassword(payload: AuthEmailPayload) {
    return api.post('/auth/forgot-password', payload);
  }

  resetPassword(payload: AuthResetPasswordPayload) {
    return api.post('/auth/reset-password', payload);
  }

  requestEmailVerification(payload: AuthEmailPayload) {
    return api.post('/auth/verify-email/request', payload);
  }

  confirmEmailVerification(payload: AuthVerifyEmailPayload) {
    return api.post('/auth/verify-email/confirm', payload);
  }

  logout() {
    return api.post('/auth/logout');
  }
}

export const authApi = new AuthApi();
