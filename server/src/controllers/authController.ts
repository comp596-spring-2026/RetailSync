import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { loginSchema, registerSchema } from '@retailsync/shared';
import { UserModel } from '../models/User';
import { CompanyModel } from '../models/Company';
import { RoleModel } from '../models/Role';
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

const buildAccess = (user: { _id: { toString(): string }; email: string; companyId?: unknown; roleId?: unknown }) =>
  signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    companyId: user.companyId ? String(user.companyId) : null,
    roleId: user.roleId ? String(user.roleId) : null
  });

export const register = async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const existing = await UserModel.findOne({ email: parsed.data.email });
  if (existing) {
    return fail(res, 'Email already in use', 409);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await UserModel.create({
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    passwordHash,
    companyId: null,
    roleId: null
  });

  const accessToken = buildAccess(user);
  const refreshToken = signRefreshToken({ sub: user._id.toString(), email: user.email });
  setRefreshCookie(res, refreshToken);

  return ok(res, { accessToken }, 201);
};

export const login = async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const user = await UserModel.findOne({ email: parsed.data.email });
  if (!user) {
    return fail(res, 'Invalid credentials', 401);
  }

  const isValid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!isValid) {
    return fail(res, 'Invalid credentials', 401);
  }

  const accessToken = buildAccess(user);
  const refreshToken = signRefreshToken({ sub: user._id.toString(), email: user.email });
  setRefreshCookie(res, refreshToken);

  return ok(res, { accessToken });
};

export const refresh = async (req: Request, res: Response) => {
  const token = req.cookies?.[refreshCookieName];
  if (!token) {
    return fail(res, 'Missing refresh token', 401);
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await UserModel.findById(payload.sub);
    if (!user || !user.isActive) {
      clearRefreshCookie(res);
      return fail(res, 'Unauthorized', 401);
    }

    const accessToken = buildAccess(user);
    const refreshToken = signRefreshToken({ sub: user._id.toString(), email: user.email });
    setRefreshCookie(res, refreshToken);

    return ok(res, { accessToken });
  } catch {
    clearRefreshCookie(res);
    return fail(res, 'Unauthorized', 401);
  }
};

export const logout = async (_req: Request, res: Response) => {
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
