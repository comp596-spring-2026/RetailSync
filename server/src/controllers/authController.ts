import bcrypt from 'bcryptjs';
import {
  authInviteAcceptSchema,
  authInviteLookupSchema,
  authLoginSchema,
  authRegisterSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailConfirmSchema,
  verifyEmailRequestSchema
} from '@retailsync/shared';
import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import { AUTH_SESSION_DEFAULTS } from '../constants/config';
import { CompanyModel } from '../models/Company';
import { AuthActionTokenModel } from '../models/AuthActionToken';
import { InviteModel } from '../models/Invite';
import { RefreshTokenModel } from '../models/RefreshToken';
import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';
import { normalizeRolePermissions } from '../services/rolePermissionsService';
import { fail, ok } from '../utils/apiResponse';
import { signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import {
  buildAccessToken,
  clearRefreshCookie,
  hashTokenId,
  refreshExpiryDate,
  refreshCookieName,
  setRefreshCookie
} from '../services/authSessionService';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/mailer';

const verificationTokenTtlMs = AUTH_SESSION_DEFAULTS.verificationTokenTtlMs;
const passwordResetTokenTtlMs = AUTH_SESSION_DEFAULTS.passwordResetTokenTtlMs;

const buildAccess = (user: {
  _id: { toString(): string };
  email: string;
  companyId?: unknown;
  roleId?: unknown;
}) =>
  buildAccessToken({
    _id: user._id,
    email: user.email,
    companyId: user.companyId,
    roleId: user.roleId
  });

const safeUser = (user: { toObject(): Record<string, unknown> }) => {
  const plain = user.toObject();
  delete plain.passwordHash;
  return plain;
};

const loadAuthContext = async (user: {
  _id: { toString(): string };
  email: string;
  companyId?: unknown;
  roleId?: unknown;
  toObject(): Record<string, unknown>;
}) => {
  const [company, role] = await Promise.all([
    user.companyId ? CompanyModel.findById(user.companyId).lean() : null,
    user.roleId && user.companyId
      ? RoleModel.findOne({ _id: user.roleId, companyId: user.companyId }).lean()
      : null
  ]);

  return {
    user: safeUser(user),
    company,
    role,
    permissions: role
      ? normalizeRolePermissions(role.permissions, {
          roleName: String(role.name ?? ''),
          isSystem: Boolean(role.isSystem)
        })
      : null
  };
};

const createAuthActionToken = async (
  user: { _id: { toString(): string }; email: string },
  purpose: 'email_verification' | 'password_reset',
  ttlMs: number
) => {
  await AuthActionTokenModel.deleteMany({
    userId: user._id,
    purpose,
    consumedAt: null
  });

  const token = randomBytes(32).toString('hex');
  await AuthActionTokenModel.create({
    userId: user._id,
    purpose,
    tokenHash: hashTokenId(token),
    sentToEmail: user.email,
    expiresAt: new Date(Date.now() + ttlMs)
  });

  return token;
};

const revokeAuthActionTokens = async (userId: string, purpose: 'email_verification' | 'password_reset') =>
  AuthActionTokenModel.updateMany(
    { userId, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } }
  );

const issueRefreshFromCookie = async (user: { _id: { toString(): string }; email: string }, res: Response) => {
  const jti = randomBytes(32).toString('hex');
  const token = signRefreshToken({ sub: user._id.toString(), email: user.email, jti });
  await RefreshTokenModel.create({
    userId: user._id,
    jtiHash: hashTokenId(jti),
    expiresAt: refreshExpiryDate()
  });
  setRefreshCookie(res, token);
};

const loadInviteContext = async (email: string, inviteCode: string) => {
  const invite = await InviteModel.findOne({
    email,
    code: inviteCode,
    acceptedAt: null
  });

  if (!invite) {
    return { error: 'Invalid invite', status: 400 } as const;
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return { error: 'Invite expired', status: 400 } as const;
  }

  const [company, role] = await Promise.all([
    CompanyModel.findById(invite.companyId).lean(),
    RoleModel.findOne({ _id: invite.roleId, companyId: invite.companyId }).lean()
  ]);

  if (!company) {
    return { error: 'Company not found for invite', status: 404 } as const;
  }

  if (!role) {
    return { error: 'Invite role not found', status: 400 } as const;
  }

  return { invite, company, role } as const;
};

export const register = async (req: Request, res: Response) => {
  const parsed = authRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await UserModel.findOne({ email });
  if (existing) {
    return fail(res, 'Account already exists', 409);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await UserModel.create({
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email,
    passwordHash,
    emailVerifiedAt: null,
    companyId: null,
    roleId: null
  });

  const verificationToken = await createAuthActionToken(
    { _id: user._id, email: user.email },
    'email_verification',
    verificationTokenTtlMs
  );

  try {
    await sendVerificationEmail({
      email: user.email,
      firstName: user.firstName,
      verificationToken
    });
  } catch (error) {
    await AuthActionTokenModel.deleteMany({ userId: user._id, purpose: 'email_verification' });
    await UserModel.deleteOne({ _id: user._id });
    return fail(
      res,
      error instanceof Error ? error.message : 'Failed to send verification email',
      503
    );
  }

  return ok(res, {
    user: safeUser(user),
    verificationRequired: true,
    verificationEmailSent: true,
    email: user.email,
    company: null,
    role: null
  }, 201);
};

export const getInviteDetails = async (req: Request, res: Response) => {
  const parsed = authInviteLookupSchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const result = await loadInviteContext(parsed.data.email.toLowerCase(), parsed.data.inviteCode);
  if ('error' in result) {
    return fail(res, result.error ?? 'Invalid invite', result.status);
  }

  return ok(res, {
    email: result.invite.email,
    inviteCode: result.invite.code,
    company: {
      _id: result.company._id,
      name: result.company.name,
      code: result.company.code
    },
    role: {
      _id: result.role._id,
      name: result.role.name
    },
    expiresAt: result.invite.expiresAt
  });
};

export const acceptInvite = async (req: Request, res: Response) => {
  const parsed = authInviteAcceptSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await UserModel.findOne({ email });
  if (existing) {
    return fail(res, 'Account already exists. Sign in to continue.', 409);
  }

  const result = await loadInviteContext(email, parsed.data.inviteCode);
  if ('error' in result) {
    return fail(res, result.error ?? 'Invalid invite', result.status);
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await UserModel.create({
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email,
    passwordHash,
    emailVerifiedAt: new Date(),
    companyId: result.company._id,
    roleId: result.role._id
  });

  result.invite.acceptedAt = new Date();
  await result.invite.save();

  const accessToken = buildAccess({
    _id: user._id,
    email: user.email,
    companyId: user.companyId,
    roleId: user.roleId
  });
  await issueRefreshFromCookie(user, res);
  const context = await loadAuthContext(user);

  return ok(res, {
    accessToken,
    ...context,
    inviteAccepted: true
  }, 201);
};

export const login = async (req: Request, res: Response) => {
  const parsed = authLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const email = parsed.data.email.toLowerCase();
  const user = await UserModel.findOne({ email });
  if (!user || !user.isActive) {
    return fail(res, 'Invalid credentials', 401);
  }

  if (!user.passwordHash || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return fail(res, 'Invalid credentials', 401);
  }

  if (!user.emailVerifiedAt) {
    return ok(res, {
      accessToken: null,
      requiresVerification: true,
      email: user.email,
      message: 'Email verification required'
    });
  }

  const accessToken = buildAccess({
    _id: user._id,
    email: user.email,
    companyId: user.companyId,
    roleId: user.roleId
  });
  await issueRefreshFromCookie(user, res);
  const context = await loadAuthContext(user);

  return ok(res, {
    accessToken,
    ...context
  });
};

export const forgotPassword = async (req: Request, res: Response) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const email = parsed.data.email.toLowerCase();
  const user = await UserModel.findOne({ email });
  if (!user || !user.isActive) {
    return ok(res, { sent: true });
  }

  const resetToken = await createAuthActionToken(
    { _id: user._id, email: user.email },
    'password_reset',
    passwordResetTokenTtlMs
  );

  try {
    await sendPasswordResetEmail({
      email: user.email,
      firstName: user.firstName,
      resetToken
    });
  } catch (error) {
    await AuthActionTokenModel.deleteMany({ userId: user._id, purpose: 'password_reset' });
    return fail(
      res,
      error instanceof Error ? error.message : 'Failed to send password reset email',
      503
    );
  }

  return ok(res, { sent: true });
};

export const resetPassword = async (req: Request, res: Response) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const tokenHash = hashTokenId(parsed.data.token);
  const token = await AuthActionTokenModel.findOne({
    purpose: 'password_reset',
    tokenHash,
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!token) {
    return fail(res, 'Invalid or expired reset token', 400);
  }

  const user = await UserModel.findById(token.userId);
  if (!user || !user.isActive) {
    return fail(res, 'Invalid or expired reset token', 400);
  }

  user.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  if (!user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
  }

  token.consumedAt = new Date();
  await Promise.all([
    revokeAuthActionTokens(user._id.toString(), 'password_reset'),
    user.save(),
    token.save()
  ]);

  const accessToken = buildAccess({
    _id: user._id,
    email: user.email,
    companyId: user.companyId,
    roleId: user.roleId
  });
  await issueRefreshFromCookie(user, res);
  const context = await loadAuthContext(user);

  return ok(res, {
    accessToken,
    ...context,
    passwordReset: true
  });
};

export const requestEmailVerification = async (req: Request, res: Response) => {
  const parsed = verifyEmailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const email = parsed.data.email.toLowerCase();
  const user = await UserModel.findOne({ email });
  if (!user || !user.isActive) {
    return ok(res, { sent: true });
  }

  if (user.emailVerifiedAt) {
    return ok(res, { sent: false, alreadyVerified: true });
  }

  const verificationToken = await createAuthActionToken(
    { _id: user._id, email: user.email },
    'email_verification',
    verificationTokenTtlMs
  );

  try {
    await sendVerificationEmail({
      email: user.email,
      firstName: user.firstName,
      verificationToken
    });
  } catch (error) {
    await AuthActionTokenModel.deleteMany({ userId: user._id, purpose: 'email_verification' });
    return fail(
      res,
      error instanceof Error ? error.message : 'Failed to send verification email',
      503
    );
  }

  return ok(res, { sent: true });
};

export const confirmEmailVerification = async (req: Request, res: Response) => {
  const parsed = verifyEmailConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const tokenHash = hashTokenId(parsed.data.token);
  const token = await AuthActionTokenModel.findOne({
    purpose: 'email_verification',
    tokenHash,
    consumedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!token) {
    return fail(res, 'Invalid or expired verification token', 400);
  }

  const user = await UserModel.findById(token.userId);
  if (!user || !user.isActive) {
    return fail(res, 'Invalid or expired verification token', 400);
  }

  if (!user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
  }
  token.consumedAt = new Date();
  await Promise.all([
    revokeAuthActionTokens(user._id.toString(), 'email_verification'),
    user.save(),
    token.save()
  ]);

  const accessToken = buildAccess({
    _id: user._id,
    email: user.email,
    companyId: user.companyId,
    roleId: user.roleId
  });
  await issueRefreshFromCookie(user, res);
  const context = await loadAuthContext(user);

  return ok(res, {
    accessToken,
    ...context,
    verified: true
  });
};

export const refresh = async (req: Request, res: Response) => {
  const token = req.cookies?.[refreshCookieName];
  if (!token) {
    return fail(res, 'Missing refresh token', 401);
  }

  try {
    const payload = verifyRefreshToken(token);
    const currentJtiHash = hashTokenId(payload.jti);
    const user = await UserModel.findById(payload.sub).select('_id email companyId roleId isActive');
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

    const accessToken = buildAccessToken(user);
    const nextJti = randomBytes(32).toString('hex');
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
    permissions: role
      ? normalizeRolePermissions(role.permissions, {
          roleName: String(role.name ?? ''),
          isSystem: Boolean(role.isSystem)
        })
      : null
  });
};
