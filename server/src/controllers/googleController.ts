import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { IntegrationSecretModel } from '../models/IntegrationSecret';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { encryptJson } from '../utils/encryption';
import { fail, ok } from '../utils/apiResponse';
import { google } from 'googleapis';
const SERVICE_ACCOUNT_EMAIL =
  'retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com';
const sheetsOauthStateCookie = 'googleSheetsOAuthState';
const SHEETS_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file'
] as const;

type GoogleSheetsStatePayload = {
  nonce: string;
  userId: string;
  companyId: string;
  purpose: 'google_sheets_connect';
};

const getOAuthClient = () => {
  if (
    !env.googleOAuthClientId ||
    !env.googleOAuthClientSecret ||
    !env.googleIntegrationRedirectUri
  ) {
    return null;
  }

  return new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleIntegrationRedirectUri,
  );
};

const buildGoogleOauthUrl = (req: Request) => {
  if (!req.user?.id || !req.user.companyId) {
    return { error: 'Unauthorized' as const };
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return {
      error:
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_INTEGRATION_REDIRECT_URI.' as const
    };
  }

  const statePayload: GoogleSheetsStatePayload = {
    nonce: randomBytes(12).toString('hex'),
    userId: req.user.id,
    companyId: req.user.companyId,
    purpose: 'google_sheets_connect'
  };
  const signedState = jwt.sign(statePayload, env.accessSecret, {
    algorithm: 'HS256',
    expiresIn: '10m'
  });
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...SHEETS_SCOPES],
    state: signedState
  });

  return { url, nonce: statePayload.nonce };
};

export const startGoogleSheetsConnect = async (req: Request, res: Response) => {
  const built = buildGoogleOauthUrl(req);
  if ('error' in built) {
    const status = built.error === 'Unauthorized' ? 401 : 501;
    const message = built.error ?? 'Google OAuth setup failed';
    return fail(res, message, status);
  }

  res.cookie(sheetsOauthStateCookie, built.nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 10 * 60 * 1000
  });
  return res.redirect(built.url);
};

export const getGoogleSheetsConnectUrl = async (req: Request, res: Response) => {
  const built = buildGoogleOauthUrl(req);
  if ('error' in built) {
    const status = built.error === 'Unauthorized' ? 401 : 501;
    const message = built.error ?? 'Google OAuth setup failed';
    return fail(res, message, status);
  }

  res.cookie(sheetsOauthStateCookie, built.nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: 10 * 60 * 1000
  });
  return ok(res, { url: built.url });
};

const settingsRedirectBase = `${env.clientUrl}/dashboard/settings`;

const redirectWithStatus = (res: Response, status: 'connected' | 'error', reason?: string) => {
  const qs = new URLSearchParams({ googleSheets: status });
  if (reason) qs.set('reason', reason);
  return res.redirect(`${settingsRedirectBase}?${qs.toString()}`);
};

export const googleSheetsCallback = async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) {
    return redirectWithStatus(res, 'error', 'missing_oauth_callback_params');
  }

  const nonceFromCookie = req.cookies?.[sheetsOauthStateCookie];
  res.clearCookie(sheetsOauthStateCookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production'
  });

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return redirectWithStatus(res, 'error', 'google_oauth_not_configured');
  }

  let parsedState: GoogleSheetsStatePayload;
  try {
    parsedState = jwt.verify(state, env.accessSecret) as GoogleSheetsStatePayload;
  } catch {
    return redirectWithStatus(res, 'error', 'invalid_oauth_state');
  }

  if (
    parsedState.purpose !== 'google_sheets_connect' ||
    !nonceFromCookie ||
    nonceFromCookie !== parsedState.nonce
  ) {
    return redirectWithStatus(res, 'error', 'oauth_state_mismatch');
  }

  try {
    const tokenRes = await oauthClient.getToken(code);
    const tokens = tokenRes.tokens;

    if (!tokens.access_token) {
      return redirectWithStatus(res, 'error', 'access_token_missing');
    }

    await IntegrationSecretModel.findOneAndUpdate(
      { companyId: parsedState.companyId, provider: 'google_oauth' },
      {
        $set: {
          encryptedPayload: encryptJson(
            {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiryDate: tokens.expiry_date,
              scope: tokens.scope,
              tokenType: tokens.token_type,
            },
            env.encryptionKey,
          ),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await IntegrationSettingsModel.findOneAndUpdate(
      { companyId: parsedState.companyId },
      {
        $set: {
          ownerUserId: parsedState.userId,
          "googleSheets.connected": true,
          "googleSheets.mode": "oauth",
          "googleSheets.updatedAt": new Date(),
        },
        $setOnInsert: {
          "googleSheets.serviceAccountEmail": SERVICE_ACCOUNT_EMAIL,
          "googleSheets.sharedConfig": {
            spreadsheetId: null,
            sheetName: "Sheet1",
            headerRow: 1,
            columnsMap: {},
            enabled: false,
            lastVerifiedAt: null,
            lastImportAt: null,
          },
          "googleSheets.sources": [],
          "quickbooks.connected": false,
          "quickbooks.environment": "sandbox",
          "quickbooks.realmId": null,
          "quickbooks.companyName": null,
          "quickbooks.updatedAt": new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return redirectWithStatus(res, 'connected');
  } catch (error) {
    console.error(error);
    return redirectWithStatus(res, 'error', 'google_oauth_callback_failed');
  }
};

// Backward-compatible exports for existing /api/google/* routes.
export const connectGoogle = startGoogleSheetsConnect;
export const connectGoogleUrl = getGoogleSheetsConnectUrl;
export const googleCallback = googleSheetsCallback;
