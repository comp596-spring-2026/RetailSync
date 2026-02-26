import { randomUUID, createHash } from 'node:crypto';
import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { CompanyModel } from '../models/Company';
import { RoleModel } from '../models/Role';
import { RefreshTokenModel } from '../models/RefreshToken';
import { fail, ok } from '../utils/apiResponse';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';

const refreshCookieName = 'refreshToken';

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(refreshCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production'
  });
};

const hashTokenId = (value: string) => createHash('sha256').update(value).digest('hex');

const refreshExpiryDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const buildAccess = (user: { _id: { toString(): string }; email: string; companyId?: unknown; roleId?: unknown }) =>
  signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    companyId: user.companyId ? String(user.companyId) : null,
    roleId: user.roleId ? String(user.roleId) : null
  });

export const refresh = async (req: Request, res: Response) => {
  const token = req.cookies?.[refreshCookieName];
  if (!token) {
    return fail(res, 'Missing refresh token', 401);
  }

  try {
    const payload = verifyRefreshToken(token);
    const currentJtiHash = hashTokenId(payload.jti);
    const user = await UserModel.findById(payload.sub);
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      return fail(res, 'Unauthorized', 401);
    }

    const tokenRecord = await RefreshTokenModel.findOne({
      userId: user._id,
      jtiHash: currentJtiHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    });

    if (!tokenRecord) {
      clearRefreshCookie(res);
      return fail(res, 'Unauthorized', 401);
    }

    const accessToken = buildAccess(user);
    const nextJti = randomUUID();
    const nextJtiHash = hashTokenId(nextJti);
    const refreshToken = signRefreshToken({ sub: user._id.toString(), email: user.email, jti: nextJti });

    tokenRecord.revokedAt = new Date();
    tokenRecord.replacedByHash = nextJtiHash;

    await Promise.all([
      tokenRecord.save(),
      RefreshTokenModel.create({
        userId: user._id,
        jtiHash: nextJtiHash,
        expiresAt: refreshExpiryDate()
      })
    ]);
    setRefreshCookie(res, refreshToken);

    return ok(res, { accessToken });
  } catch {
    clearRefreshCookie(res);
    return fail(res, 'Unauthorized', 401);
  }
};

export const logout = async (req: Request, res: Response) => {
  const token = req.cookies?.[refreshCookieName];
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await RefreshTokenModel.updateOne(
        { userId: payload.sub, jtiHash: hashTokenId(payload.jti), revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
    } catch {
      // No-op on malformed/expired token.
    }
  }
  clearRefreshCookie(res);
  return ok(res, { message: 'Logged out' });
};

export const me = async (req: Request, res: Response) => {
  if (!req.user) {
    return fail(res, 'Unauthorized', 401);
  }

  const user = await UserModel.findById(req.user.id).select('-passwordHash').lean();
  if (!user) {
    return fail(res, 'Unauthorized', 401);
  }

  const [company, role] = await Promise.all([
    user.companyId ? CompanyModel.findById(user.companyId).lean() : null,
    user.roleId ? RoleModel.findById(user.roleId).lean() : null
  ]);

  return ok(res, {
    user,
    company,
    role,
    permissions: role?.permissions ?? null
  });
};
