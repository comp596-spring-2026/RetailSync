import { google } from 'googleapis';
import { env } from '../../config/env';
import {
  loadEncryptedProviderSecret,
  patchEncryptedProviderSecret,
  saveEncryptedProviderSecret
} from '../common/encryptedSecretStore';

const SHEETS_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
] as const;

export const GOOGLE_OAUTH_PROVIDER = 'google_oauth';

export type GoogleOAuthSecret = {
  accessToken: string;
  refreshToken: string | null;
  expiryDate?: number | null;
  scope?: string | null;
  tokenType?: string | null;
  connectedEmail?: string | null;
};

export const ensureGoogleOAuthConfig = () => {
  if (!env.googleOAuthClientId || !env.googleOAuthClientSecret || !env.googleIntegrationRedirectUri) {
    throw new Error('Google OAuth is not configured on server');
  }

  if (!env.encryptionKey) {
    throw new Error('missing encryption_key');
  }

  return {
    clientId: env.googleOAuthClientId,
    clientSecret: env.googleOAuthClientSecret,
    redirectUri: env.googleIntegrationRedirectUri
  };
};

export const createGoogleOAuthClient = () => {
  const { clientId, clientSecret, redirectUri } = ensureGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
};

export const buildGoogleSheetsAuthorizationUrl = (state: string) => {
  const oauthClient = createGoogleOAuthClient();
  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent select_account',
    scope: [...SHEETS_SCOPES],
    state
  });
};

export const exchangeGoogleAuthorizationCode = async (code: string) => {
  const oauthClient = createGoogleOAuthClient();
  const tokenResponse = await oauthClient.getToken(code);
  return {
    oauthClient,
    tokens: tokenResponse.tokens
  };
};

export const loadGoogleOAuthSecret = (companyId: string) =>
  loadEncryptedProviderSecret<GoogleOAuthSecret>(companyId, GOOGLE_OAUTH_PROVIDER);

export const saveGoogleOAuthSecret = (
  companyId: string,
  payload: GoogleOAuthSecret
) => saveEncryptedProviderSecret(companyId, GOOGLE_OAUTH_PROVIDER, payload);

export const updateGoogleOAuthSecret = (
  companyId: string,
  updater: (current: GoogleOAuthSecret | null) => GoogleOAuthSecret
) => patchEncryptedProviderSecret(companyId, GOOGLE_OAUTH_PROVIDER, updater);

export const resolveGoogleConnectedEmail = async ({
  oauthClient,
  idToken
}: {
  oauthClient: ReturnType<typeof createGoogleOAuthClient>;
  idToken?: string | null;
}) => {
  try {
    if (typeof idToken === 'string' && env.googleOAuthClientId) {
      const ticket = await oauthClient.verifyIdToken({
        idToken,
        audience: env.googleOAuthClientId
      });
      const email = ticket.getPayload()?.email;
      return typeof email === 'string' && email.trim() ? email.trim() : null;
    }

    const oauth2 = google.oauth2({ version: 'v2', auth: oauthClient });
    const userInfo = await oauth2.userinfo.get();
    return typeof userInfo.data.email === 'string' && userInfo.data.email.trim()
      ? userInfo.data.email.trim()
      : null;
  } catch {
    return null;
  }
};
