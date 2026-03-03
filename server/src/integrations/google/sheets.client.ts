import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env';
import { IntegrationSecretModel } from '../../models/IntegrationSecret';
import { decryptJson, encryptJson } from '../../utils/encryption';

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const LOCAL_SERVICE_ACCOUNT_FILE = 'gcp-service-account-retailsync-run-sa.json';

export type GoogleSheetsAuthMode = 'service_account' | 'oauth';

/** Canonical shape for google_oauth encryptedPayload. refreshToken never overwritten with undefined. */
export type GoogleOAuthSecret = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate?: number | null;
  scope?: string | null;
  tokenType?: string | null;
  connectedEmail?: string | null;
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

type ServiceAccountCredentials = Record<string, unknown>;

const parseServiceAccountJson = (value: string): ServiceAccountCredentials => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is empty');
  }
  try {
    return JSON.parse(trimmed) as ServiceAccountCredentials;
  } catch {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      return JSON.parse(decoded) as ServiceAccountCredentials;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64-encoded JSON)');
    }
  }
};

const resolveServiceAccountCredentials = (): ServiceAccountCredentials | null => {
  if (env.googleServiceAccountJson) {
    return parseServiceAccountJson(env.googleServiceAccountJson);
  }
  const localCredsPath = findLocalServiceAccountPath();
  if (!localCredsPath) return null;
  return JSON.parse(fs.readFileSync(localCredsPath, 'utf-8')) as ServiceAccountCredentials;
};

const createServiceAccountAuth = (scopes: string[]) => {
  const credentials = resolveServiceAccountCredentials();
  if (credentials) {
    return new google.auth.GoogleAuth({ scopes, credentials });
  }

  if (env.nodeEnv === 'production') {
    // In production, allow workload identity / ADC (should resolve to service account runtime identity).
    return new google.auth.GoogleAuth({ scopes });
  }

  throw new Error(
    'Service account credentials not configured for shared mode. ' +
      `Provide credentials/${LOCAL_SERVICE_ACCOUNT_FILE} or GOOGLE_SERVICE_ACCOUNT_JSON.`
  );
};

export function getSheetsClient() {
  const auth = createServiceAccountAuth(SHEETS_SCOPES);

  return google.sheets({ version: 'v4', auth });
}

/** Drive client with service account (for listing spreadsheets shared with the SA). */
export function getDriveClientForServiceAccount() {
  const auth = createServiceAccountAuth([DRIVE_READ_SCOPE]);

  return google.drive({ version: 'v3', auth });
}

const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

/**
 * Returns an OAuth2 client for the company. Loads tokens from IntegrationSecretModel,
 * refreshes if expired (and persists new access_token/expiry_date; never overwrites refreshToken),
 * and attaches a listener to persist tokens on future refreshes.
 */
export async function getOAuthClientForCompany(companyId: string) {
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleIntegrationRedirectUri) {
    throw new Error('Google OAuth is not configured on server');
  }

  const secretDoc = await IntegrationSecretModel.findOne({
    companyId,
    provider: 'google_oauth'
  }).select('+encryptedPayload');

  if (!secretDoc?.encryptedPayload) {
    throw new Error('Google OAuth tokens not found. Configure an OAuth source for this sheet first.');
  }

  const payload = decryptJson<GoogleOAuthSecret>(secretDoc.encryptedPayload, env.encryptionKey);
  const oauthClient = new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleIntegrationRedirectUri
  );

  oauthClient.setCredentials({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken != null ? payload.refreshToken : undefined,
    expiry_date: payload.expiryDate ?? undefined,
    token_type: payload.tokenType != null ? payload.tokenType : undefined,
    scope: payload.scope != null ? payload.scope : undefined
  });

  const persistTokens = async (tokens: { access_token?: string; refresh_token?: string; expiry_date?: number }) => {
    const nextRefresh = tokens.refresh_token ?? payload.refreshToken;
    const nextPayload: GoogleOAuthSecret = {
      accessToken: tokens.access_token ?? payload.accessToken,
      refreshToken: nextRefresh ?? payload.refreshToken,
      expiryDate: tokens.expiry_date ?? payload.expiryDate ?? null,
      scope: payload.scope ?? null,
      tokenType: payload.tokenType ?? null,
      connectedEmail: payload.connectedEmail ?? null
    };
    await IntegrationSecretModel.updateOne(
      { companyId, provider: 'google_oauth' },
      { $set: { encryptedPayload: encryptJson(nextPayload, env.encryptionKey) } }
    );
  };

  oauthClient.on('tokens', (tokens) => {
    void persistTokens({
      access_token: tokens.access_token != null ? tokens.access_token : undefined,
      refresh_token: tokens.refresh_token != null ? tokens.refresh_token : undefined,
      expiry_date: tokens.expiry_date ?? undefined
    });
  });

  const now = Date.now();
  const expiry = payload.expiryDate ?? 0;
  if (payload.refreshToken && expiry && expiry < now + TOKEN_REFRESH_BUFFER_MS) {
    try {
      const { credentials } = await oauthClient.refreshAccessToken();
      await persistTokens({
        access_token: credentials.access_token ?? undefined,
        refresh_token: credentials.refresh_token ?? undefined,
        expiry_date: credentials.expiry_date ?? undefined
      });
      oauthClient.setCredentials({
        ...credentials,
        refresh_token: credentials.refresh_token != null ? credentials.refresh_token : undefined
      });
    } catch (e) {
      // proceed with existing token; next request may fail and user can reconnect
    }
  }

  return oauthClient;
}

export async function getSheetsClientForCompany(authMode: GoogleSheetsAuthMode, companyId: string) {
  if (authMode === 'service_account') {
    return getSheetsClient();
  }
  const oauthClient = await getOAuthClientForCompany(companyId);
  return google.sheets({ version: 'v4', auth: oauthClient });
}

export async function getDriveClientForCompany(companyId: string) {
  const oauthClient = await getOAuthClientForCompany(companyId);
  return google.drive({ version: 'v3', auth: oauthClient });
}
