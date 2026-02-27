import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env';
import { IntegrationSecretModel } from '../../models/IntegrationSecret';
import { decryptJson } from '../../utils/encryption';

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const LOCAL_SERVICE_ACCOUNT_FILE = 'gcp-service-account-retailsync-run-sa.json';

export type GoogleSheetsAuthMode = 'service_account' | 'oauth';

type GoogleOAuthSecret = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
};

const findLocalServiceAccountPath = () => {
  const thisFilePath = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFilePath);
  const candidates = [
    path.resolve(process.cwd(), 'credentials', LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(process.cwd(), '..', 'credentials', LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(thisDir, '../../../../credentials', LOCAL_SERVICE_ACCOUNT_FILE)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

export function getSheetsClient() {
  const isProduction = process.env.NODE_ENV === 'production';
  const localCredsPath = isProduction ? null : findLocalServiceAccountPath();

  const auth = localCredsPath
    ? new google.auth.GoogleAuth({
        scopes: SHEETS_SCOPES,
        credentials: JSON.parse(fs.readFileSync(localCredsPath, 'utf-8'))
      })
    : new google.auth.GoogleAuth({ scopes: SHEETS_SCOPES });

  return google.sheets({ version: 'v4', auth });
}

export async function getSheetsClientForCompany(authMode: GoogleSheetsAuthMode, companyId: string) {
  if (authMode === 'service_account') {
    return getSheetsClient();
  }

  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleIntegrationRedirectUri) {
    throw new Error('Google OAuth is not configured on server');
  }

  const secretDoc = await IntegrationSecretModel.findOne({
    companyId,
    provider: 'google_oauth'
  }).select('+encryptedPayload');

  if (!secretDoc?.encryptedPayload) {
    throw new Error('Google OAuth tokens not found. Connect Google first.');
  }

  const tokenPayload = decryptJson<GoogleOAuthSecret>(secretDoc.encryptedPayload, env.encryptionKey);

  const oauthClient = new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleIntegrationRedirectUri
  );
  oauthClient.setCredentials({
    access_token: tokenPayload.accessToken,
    refresh_token: tokenPayload.refreshToken,
    expiry_date: tokenPayload.expiryDate,
    token_type: tokenPayload.tokenType,
    scope: tokenPayload.scope
  });

  return google.sheets({ version: 'v4', auth: oauthClient });
}

export async function getDriveClientForCompany(companyId: string) {
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleIntegrationRedirectUri) {
    throw new Error('Google OAuth is not configured on server');
  }

  const secretDoc = await IntegrationSecretModel.findOne({
    companyId,
    provider: 'google_oauth'
  }).select('+encryptedPayload');

  if (!secretDoc?.encryptedPayload) {
    throw new Error('Google OAuth tokens not found. Connect Google first.');
  }

  const tokenPayload = decryptJson<GoogleOAuthSecret>(secretDoc.encryptedPayload, env.encryptionKey);
  const oauthClient = new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleIntegrationRedirectUri
  );
  oauthClient.setCredentials({
    access_token: tokenPayload.accessToken,
    refresh_token: tokenPayload.refreshToken,
    expiry_date: tokenPayload.expiryDate,
    token_type: tokenPayload.tokenType,
    scope: tokenPayload.scope
  });

  return google.drive({ version: 'v3', auth: oauthClient });
}
