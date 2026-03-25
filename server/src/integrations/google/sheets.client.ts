import { google } from 'googleapis';
import { env } from '../../config/env';
import {
  LOCAL_SERVICE_ACCOUNT_FILE,
  resolveServiceAccountCredentials,
} from './serviceAccountCredentials';
import {
  createGoogleOAuthClient,
  GoogleOAuthSecret,
  loadGoogleOAuthSecret,
  saveGoogleOAuthSecret
} from './oauth';

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const DRIVE_READ_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

export type GoogleSheetsAuthMode = 'service_account' | 'oauth';

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
  const payload = await loadGoogleOAuthSecret(companyId);
  if (!payload) {
    throw new Error('Google OAuth tokens not found. Configure an OAuth source for this sheet first.');
  }

  const oauthClient = createGoogleOAuthClient();

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
    await saveGoogleOAuthSecret(companyId, nextPayload);
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
