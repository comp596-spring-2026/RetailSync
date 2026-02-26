import { Request, Response } from 'express';
import { google } from 'googleapis';
import { env } from '../config/env';
import { IntegrationSecretModel } from '../models/IntegrationSecret';
import { decryptJson } from '../utils/encryption';
import { fail, ok } from '../utils/apiResponse';

const SHEETS_READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
type GoogleOAuthSecret = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
};

const normalizeRows = (values: unknown[][] | undefined) => {
  if (!values) return [] as string[][];
  return values.map((row) => row.map((cell) => String(cell ?? '')));
};

const readWithServiceAccount = async (spreadsheetId: string, range: string) => {
  const auth = new google.auth.GoogleAuth({
    scopes: [SHEETS_READ_SCOPE]
  });

  const sheets = google.sheets({ version: 'v4', auth });
  return sheets.spreadsheets.values.get({ spreadsheetId, range });
};

const readWithOAuth = async (spreadsheetId: string, range: string, req: Request) => {
  if (!req.user?.id || !req.user.companyId) {
    throw new Error('Unauthorized');
  }

  const tokenDoc = await IntegrationSecretModel.findOne({
    companyId: req.user.companyId,
    provider: 'google_oauth'
  }).select('+encryptedPayload');

  if (!tokenDoc?.encryptedPayload) {
    throw new Error('Google OAuth tokens not found. Use Connect Google first.');
  }

  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleIntegrationRedirectUri) {
    throw new Error('Google OAuth is not configured on server');
  }

  const oauthClient = new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleIntegrationRedirectUri
  );

  const tokenPayload = decryptJson<GoogleOAuthSecret>(tokenDoc.encryptedPayload, env.encryptionKey);

  oauthClient.setCredentials({
    access_token: tokenPayload.accessToken,
    refresh_token: tokenPayload.refreshToken ?? undefined,
    expiry_date: tokenPayload.expiryDate ?? undefined,
    token_type: tokenPayload.tokenType ?? undefined,
    scope: tokenPayload.scope ?? undefined
  });

  const sheets = google.sheets({ version: 'v4', auth: oauthClient });
  return sheets.spreadsheets.values.get({ spreadsheetId, range });
};

export const readSheet = async (req: Request, res: Response) => {
  const spreadsheetId = typeof req.query.spreadsheetId === 'string' ? req.query.spreadsheetId.trim() : '';
  const range = typeof req.query.range === 'string' ? req.query.range.trim() : 'Sheet1!A1:Z';
  const authMode = typeof req.query.authMode === 'string' ? req.query.authMode : 'service';

  if (!spreadsheetId) {
    return fail(res, 'Missing spreadsheetId query param', 400);
  }

  if (!range) {
    return fail(res, 'Missing range query param', 400);
  }

  try {
    const response =
      authMode === 'oauth'
        ? await readWithOAuth(spreadsheetId, range, req)
        : await readWithServiceAccount(spreadsheetId, range);

    const rows = normalizeRows(response.data.values as unknown[][] | undefined);
    const preview = rows.slice(0, 10);

    return ok(res, {
      spreadsheetId,
      range,
      rowCount: rows.length,
      rows,
      preview
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read spreadsheet';
    const looksLikePermissionIssue =
      /permission|forbidden|insufficient|not found|access/i.test(message) ||
      /403|404/.test(message);
    const statusCode = looksLikePermissionIssue ? 403 : 500;
    return fail(res, message, statusCode);
  }
};
