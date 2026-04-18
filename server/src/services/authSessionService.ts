import { createHash, randomUUID } from 'node:crypto';
import { Response } from 'express';
import { RefreshTokenModel } from '../models/RefreshToken';
import { env } from '../config/env';
import { AUTH_COOKIE_NAMES, AUTH_SESSION_DEFAULTS } from '../constants/config';
import { signAccessToken, signRefreshToken } from '../utils/jwt';

export const refreshCookieName = AUTH_COOKIE_NAMES.refreshToken;

export const hashTokenId = (value: string) => createHash('sha256').update(value).digest('hex');

export const refreshExpiryDate = () => new Date(Date.now() + AUTH_SESSION_DEFAULTS.refreshTokenTtlMs);

export const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(refreshCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: AUTH_SESSION_DEFAULTS.refreshTokenTtlMs
  });
};

export const clearRefreshCookie = (res: Response) => {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production'
  });
};

export const buildAccessToken = (user: {
  _id: { toString(): string };
  email: string;
  companyId?: unknown;
  roleId?: unknown;
}) =>
  signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    companyId: user.companyId ? String(user.companyId) : null,
    roleId: user.roleId ? String(user.roleId) : null
  });

export const issueRefreshToken = async (
  user: { _id: { toString(): string }; email: string },
  res: Response
) => {
  const jti = randomUUID();
  const token = signRefreshToken({ sub: user._id.toString(), email: user.email, jti });
  await RefreshTokenModel.create({
    userId: user._id,
    jtiHash: hashTokenId(jti),
    expiresAt: refreshExpiryDate()
  });
  setRefreshCookie(res, token);
  return token;
};

export const issueSession = async (
  user: {
    _id: { toString(): string };
    email: string;
    companyId?: unknown;
    roleId?: unknown;
  },
  res: Response
) => {
  const accessToken = buildAccessToken(user);
  await issueRefreshToken(user, res);
  return { accessToken };
};
