import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type AccessPayload = {
  sub: string;
  email: string;
  companyId: string | null;
  roleId: string | null;
};

export const signAccessToken = (payload: AccessPayload) =>
  jwt.sign(payload, env.accessSecret, { expiresIn: '15m' });

export const signRefreshToken = (payload: Pick<AccessPayload, 'sub' | 'email'> & { jti: string }) =>
  jwt.sign(payload, env.refreshSecret, { expiresIn: '7d' });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.accessSecret) as AccessPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.refreshSecret) as { sub: string; email: string; jti: string };
