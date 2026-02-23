import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { loginSchema, registerSchema } from '@retailsync/shared';
import { z } from 'zod';
import { UserModel } from '../models/User';
import { CompanyModel } from '../models/Company';
import { RoleModel } from '../models/Role';
import { RefreshTokenModel } from '../models/RefreshToken';
import { PasswordResetTokenModel } from '../models/PasswordResetToken';
import { EmailVerificationTokenModel } from '../models/EmailVerificationToken';
import { fail, ok } from '../utils/apiResponse';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { env } from '../config/env';
import { sendEmail } from '../services/emailService';
import { resetPasswordTemplate, verifyEmailTemplate } from '../services/emailTemplates';

const refreshCookieName = 'refreshToken';
const resetTokenMinutes = 30;
const verificationTokenHours = 24;

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z
  .object({
    token: z.string().regex(/^\d{3}-\d{3}$/, 'token must be in 123-456 format'),
    password: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

const verifyEmailSchema = z.object({
  token: z.string().regex(/^\d{3}-\d{3}$/, 'token must be in 123-456 format')
});

const generateCode = () => {
  const a = Math.floor(100 + Math.random() * 900);
  const b = Math.floor(100 + Math.random() * 900);
  return `${a}-${b}`;
};

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

const issueRefreshToken = async (userId: string, email: string, res: Response) => {
  const jti = randomUUID();
  const token = signRefreshToken({ sub: userId, email, jti });
  await RefreshTokenModel.create({
    userId,
    jtiHash: hashTokenId(jti),
    expiresAt: refreshExpiryDate()
  });
  setRefreshCookie(res, token);
  return token;
};

const buildAccess = (user: { _id: { toString(): string }; email: string; companyId?: unknown; roleId?: unknown }) =>
  signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    companyId: user.companyId ? String(user.companyId) : null,
    roleId: user.roleId ? String(user.roleId) : null
  });

const trySendEmail = async (payload: { to: string; subject: string; html: string }) => {
  try {
    await sendEmail(payload);
    return { sent: true as const };
  } catch (error) {
    console.error('Email delivery failed:', error);
    return {
      sent: false as const,
      error: error instanceof Error ? error.message : 'Unknown email error'
    };
  }
};

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

  const rawVerificationToken = generateCode();
  const verificationTokenHash = createHash('sha256').update(rawVerificationToken).digest('hex');
  await EmailVerificationTokenModel.create({
    userId: user._id,
    tokenHash: verificationTokenHash,
    expiresAt: new Date(Date.now() + verificationTokenHours * 60 * 60 * 1000)
  });

  const emailResult = await trySendEmail({
    to: user.email,
    subject: 'Verify your RetailSync account',
    html: verifyEmailTemplate(rawVerificationToken)
  });

  return ok(
    res,
    {
      verificationSent: emailResult.sent,
      message: emailResult.sent
        ? 'Account created. Verify your email with the OTP code before login.'
        : 'Account created. Email delivery is unavailable; use OTP code in non-production environments.',
      verifyCode: env.nodeEnv === 'production' ? undefined : rawVerificationToken,
      emailDebug: env.nodeEnv === 'production' ? undefined : emailResult.error
    },
    201
  );
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
  if (!user.emailVerifiedAt) {
    return fail(res, 'Email is not verified. Please verify with OTP code.', 403);
  }

  const accessToken = buildAccess(user);
  await issueRefreshToken(user._id.toString(), user.email, res);

  return ok(res, { accessToken });
};

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

export const forgotPassword = async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const user = await UserModel.findOne({ email: parsed.data.email });
  if (!user) {
    return ok(res, {
      message: 'If this email exists, a reset code has been generated.'
    });
  }

  await PasswordResetTokenModel.deleteMany({ userId: user._id, consumedAt: null });

  const rawToken = generateCode();
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + resetTokenMinutes * 60 * 1000);

  await PasswordResetTokenModel.create({
    userId: user._id,
    tokenHash,
    expiresAt
  });

  const emailResult = await trySendEmail({
    to: user.email,
    subject: 'RetailSync password reset',
    html: resetPasswordTemplate(rawToken)
  });

  return ok(res, {
    message: emailResult.sent
      ? 'Password reset code generated.'
      : 'Password reset code generated, but email delivery is unavailable.',
    emailDebug: env.nodeEnv === 'production' ? undefined : emailResult.error
  });
};

export const resetPassword = async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const tokenDoc = await PasswordResetTokenModel.findOne({
    tokenHash,
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!tokenDoc) {
    return fail(res, 'Reset token is invalid or expired', 400);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await Promise.all([
    UserModel.updateOne({ _id: tokenDoc.userId }, { $set: { passwordHash } }),
    PasswordResetTokenModel.updateOne({ _id: tokenDoc._id }, { $set: { consumedAt: new Date() } }),
    RefreshTokenModel.updateMany({ userId: tokenDoc.userId, revokedAt: null }, { $set: { revokedAt: new Date() } })
  ]);

  return ok(res, { message: 'Password has been reset. Please login again.' });
};

export const verifyEmail = async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const tokenHash = createHash('sha256').update(parsed.data.token).digest('hex');
  const tokenDoc = await EmailVerificationTokenModel.findOne({
    tokenHash,
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!tokenDoc) {
    return fail(res, 'Verification token is invalid or expired', 400);
  }

  await Promise.all([
    UserModel.updateOne({ _id: tokenDoc.userId }, { $set: { emailVerifiedAt: new Date() } }),
    EmailVerificationTokenModel.updateOne({ _id: tokenDoc._id }, { $set: { consumedAt: new Date() } })
  ]);

  return ok(res, { message: 'Email verified successfully.' });
};

export const resendVerification = async (req: Request, res: Response) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!email) {
    return fail(res, 'email is required', 400);
  }

  const user = await UserModel.findOne({ email });
  if (!user) {
    return ok(res, { message: 'If this email exists, a verification code has been generated.' });
  }
  if (user.emailVerifiedAt) {
    return ok(res, { message: 'Email is already verified.' });
  }

  await EmailVerificationTokenModel.deleteMany({ userId: user._id, consumedAt: null });
  const rawVerificationToken = generateCode();
  const verificationTokenHash = createHash('sha256').update(rawVerificationToken).digest('hex');
  await EmailVerificationTokenModel.create({
    userId: user._id,
    tokenHash: verificationTokenHash,
    expiresAt: new Date(Date.now() + verificationTokenHours * 60 * 60 * 1000)
  });

  const emailResult = await trySendEmail({
    to: user.email,
    subject: 'Verify your RetailSync account',
    html: verifyEmailTemplate(rawVerificationToken)
  });

  return ok(res, {
    message: emailResult.sent
      ? 'Verification code generated.'
      : 'Verification code generated, but email delivery is unavailable.',
    verifyCode: env.nodeEnv === 'production' ? undefined : rawVerificationToken,
    emailDebug: env.nodeEnv === 'production' ? undefined : emailResult.error
  });
};
