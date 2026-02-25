import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { google } from 'googleapis';
import { env } from '../config/env';
import { fail } from '../utils/apiResponse';
import { UserModel } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { signAccessToken, signRefreshToken } from '../utils/jwt';

const stateCookieName = 'googleOAuthState';
const refreshCookieName = 'refreshToken';

const hashTokenId = (value: string) => createHash('sha256').update(value).digest('hex');
const refreshExpiryDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const getOAuthClient = () => {
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleAuthRedirectUri) {
    return null;
  }

  return new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleAuthRedirectUri
  );
};

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie(refreshCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};

const setStateCookie = (res: Response, state: string) => {
  res.cookie(stateCookieName, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 10 * 60 * 1000
  });
};

const clearStateCookie = (res: Response) => {
  res.clearCookie(stateCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production'
  });
};

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

export const googleAuthStart = async (_req: Request, res: Response) => {
  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return fail(
      res,
      'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_AUTH_REDIRECT_URI.',
      501
    );
  }

  const state = randomBytes(24).toString('hex');
  setStateCookie(res, state);

  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['openid', 'email', 'profile'],
    state
  });

  return res.redirect(url);
};

export const googleAuthCallback = async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const stateCookie = req.cookies?.[stateCookieName];
  clearStateCookie(res);

  if (!code || !state || !stateCookie || stateCookie !== state) {
    return res.redirect(`${env.clientUrl}/login?error=google_oauth_state_invalid`);
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return res.redirect(`${env.clientUrl}/login?error=google_oauth_not_configured`);
  }

  try {
    const { tokens } = await oauthClient.getToken(code);
    if (!tokens.id_token) {
      return res.redirect(`${env.clientUrl}/login?error=google_id_token_missing`);
    }

    const ticket = await oauthClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: env.googleOAuthClientId as string
    });
    const payload = ticket.getPayload();
    const googleId = payload?.sub;
    const email = payload?.email?.toLowerCase();
    const emailVerified = Boolean(payload?.email_verified);
    const givenName = payload?.given_name?.trim() || 'Google';
    const familyName = payload?.family_name?.trim() || 'User';

    if (!email || !googleId) {
      return res.redirect(`${env.clientUrl}/login?error=google_email_missing`);
    }
    if (!emailVerified) {
      return res.redirect(`${env.clientUrl}/login?error=google_email_not_verified`);
    }

    let user = await UserModel.findOne({ $or: [{ googleId }, { email }] });
    if (!user) {
      const passwordHash = await bcrypt.hash(randomUUID(), 12);
      user = await UserModel.create({
        firstName: givenName,
        lastName: familyName,
        email,
        googleId,
        passwordHash,
        emailVerifiedAt: new Date(),
        companyId: null,
        roleId: null
      });
    } else {
      user.googleId = user.googleId || googleId;
      user.email = email;
      if (!user.emailVerifiedAt) {
        user.emailVerifiedAt = new Date();
      }
      await user.save();
    }

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      companyId: user.companyId ? String(user.companyId) : null,
      roleId: user.roleId ? String(user.roleId) : null
    });
    await issueRefreshToken(user._id.toString(), user.email, res);

    return res.redirect(
      `${env.clientUrl}/auth/google/success?accessToken=${encodeURIComponent(accessToken)}`
    );
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    return res.redirect(`${env.clientUrl}/login?error=google_oauth_callback_failed`);
  }
};
