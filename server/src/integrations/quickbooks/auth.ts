import { env } from '../../config/env';
import {
  loadEncryptedProviderSecret,
  saveEncryptedProviderSecret
} from '../common/encryptedSecretStore';
import {
  QuickBooksEnvironment,
  QuickBooksSecretHealth,
  QuickBooksSecretPayload,
  QuickBooksTokenApiResponse
} from './types';

const QUICKBOOKS_AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QUICKBOOKS_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export const QUICKBOOKS_OAUTH_PROVIDER = 'quickbooks_oauth';
export const QUICKBOOKS_OAUTH_SCOPES =
  'com.intuit.quickbooks.accounting openid profile email';

const parseOptionalNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const QUICKBOOKS_ACCESS_TOKEN_NEAR_EXPIRY_THRESHOLD_SECONDS = 45;
const QUICKBOOKS_REFRESH_TOKEN_NEAR_EXPIRY_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

const getTokenExpiresInSec = (expiresAt: number | null, now = Date.now()) => {
  if (expiresAt == null) {
    return null;
  }
  return Math.max(0, Math.floor((expiresAt - now) / 1000));
};

export const buildQuickBooksSecretHealth = ({
  payload,
  checkedAt = Date.now(),
  refreshedAt = payload.health?.refreshedAt ?? payload.updatedAt ?? null,
  lastRefreshError = payload.health?.lastRefreshError ?? null,
  lastRefreshErrorAt = payload.health?.lastRefreshErrorAt ?? null
}: {
  payload: QuickBooksSecretPayload;
  checkedAt?: number;
  refreshedAt?: number | null;
  lastRefreshError?: string | null;
  lastRefreshErrorAt?: number | null;
}): QuickBooksSecretHealth => {
  const accessTokenExpiresInSec = getTokenExpiresInSec(payload.expiresAt, checkedAt);
  const refreshTokenExpiresInSec = getTokenExpiresInSec(payload.refreshExpiresAt, checkedAt);
  const accessTokenNearExpiry =
    accessTokenExpiresInSec != null &&
    accessTokenExpiresInSec <= QUICKBOOKS_ACCESS_TOKEN_NEAR_EXPIRY_THRESHOLD_SECONDS;
  const refreshTokenNearExpiry =
    refreshTokenExpiresInSec != null &&
    refreshTokenExpiresInSec <= QUICKBOOKS_REFRESH_TOKEN_NEAR_EXPIRY_THRESHOLD_SECONDS;
  const degraded = Boolean(lastRefreshError) || accessTokenNearExpiry || refreshTokenNearExpiry;

  return {
    status: degraded ? 'degraded' : 'healthy',
    checkedAt,
    refreshedAt,
    accessTokenExpiresAt: payload.expiresAt,
    accessTokenExpiresInSec,
    refreshTokenExpiresAt: payload.refreshExpiresAt,
    refreshTokenExpiresInSec,
    lastRefreshError,
    lastRefreshErrorAt
  };
};

const toQuickBooksRefreshFailureMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'quickbooks_token_refresh_failed';
};

export const ensureQuickBooksConfig = () => {
  if (
    !env.quickbooksClientId ||
    !env.quickbooksClientSecret ||
    !env.quickbooksIntegrationRedirectUri
  ) {
    throw new Error(
      'quickbooks_oauth_not_configured: set QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, and QUICKBOOKS_INTEGRATION_REDIRECT_URI'
    );
  }
  if (!env.encryptionKey) {
    throw new Error('missing encryption_key');
  }
  return {
    clientId: env.quickbooksClientId,
    clientSecret: env.quickbooksClientSecret,
    redirectUri: env.quickbooksIntegrationRedirectUri
  };
};

const requestQuickBooksToken = async (params: URLSearchParams) => {
  const { clientId, clientSecret } = ensureQuickBooksConfig();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`, 'utf-8').toString('base64');

  const response = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: params.toString()
  });

  const rawBody = await response.text();
  let payload: QuickBooksTokenApiResponse = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as QuickBooksTokenApiResponse) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorCode = String(payload.error ?? '').trim();
    const errorDescription = String(payload.error_description ?? '').trim();
    throw new Error(
      `quickbooks_token_exchange_failed:${errorCode || response.status}:${errorDescription || rawBody || 'unknown'}`
    );
  }

  return payload;
};

export const buildQuickBooksAuthorizationUrl = (state: string) => {
  const { clientId, redirectUri } = ensureQuickBooksConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: QUICKBOOKS_OAUTH_SCOPES,
    redirect_uri: redirectUri,
    state
  });
  return `${QUICKBOOKS_AUTHORIZE_URL}?${params.toString()}`;
};

export const exchangeQuickBooksAuthorizationCode = async (code: string) => {
  const { redirectUri } = ensureQuickBooksConfig();
  return requestQuickBooksToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri
    })
  );
};

export const refreshQuickBooksAccessToken = async (refreshToken: string) =>
  requestQuickBooksToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
  );

export const loadQuickBooksSecret = async (companyId: string) => {
  ensureQuickBooksConfig();
  return loadEncryptedProviderSecret<QuickBooksSecretPayload>(
    companyId,
    QUICKBOOKS_OAUTH_PROVIDER
  );
};

export const saveQuickBooksSecret = async (
  companyId: string,
  payload: QuickBooksSecretPayload
) => {
  ensureQuickBooksConfig();
  await saveEncryptedProviderSecret(companyId, QUICKBOOKS_OAUTH_PROVIDER, payload);
};

export const toQuickBooksSecretPayload = ({
  tokenResponse,
  environment,
  realmId,
  previous,
  companyName
}: {
  tokenResponse: QuickBooksTokenApiResponse;
  environment: QuickBooksEnvironment;
  realmId: string;
  previous?: QuickBooksSecretPayload | null;
  companyName?: string | null;
}): QuickBooksSecretPayload => {
  const accessToken = String(tokenResponse.access_token ?? '').trim();
  if (!accessToken) {
    throw new Error('access_token_missing');
  }

  const refreshToken =
    String(tokenResponse.refresh_token ?? '').trim() ||
    String(previous?.refreshToken ?? '').trim();
  if (!refreshToken) {
    throw new Error('quickbooks_refresh_token_missing');
  }

  const now = Date.now();
  const expiresInSec = parseOptionalNumber(tokenResponse.expires_in);
  const refreshExpiresInSec = parseOptionalNumber(tokenResponse.x_refresh_token_expires_in);
  const refreshedAt = now;

  const payload: QuickBooksSecretPayload = {
    accessToken,
    refreshToken,
    tokenType: String(tokenResponse.token_type ?? previous?.tokenType ?? 'Bearer'),
    scope:
      typeof tokenResponse.scope === 'string'
        ? tokenResponse.scope
        : (previous?.scope ?? null),
    idToken:
      typeof tokenResponse.id_token === 'string'
        ? tokenResponse.id_token
        : (previous?.idToken ?? null),
    realmId,
    environment,
    companyName: companyName ?? previous?.companyName ?? null,
    expiresAt:
      expiresInSec != null && expiresInSec > 0
        ? now + expiresInSec * 1000
        : (previous?.expiresAt ?? null),
    refreshExpiresAt:
      refreshExpiresInSec != null && refreshExpiresInSec > 0
        ? now + refreshExpiresInSec * 1000
        : (previous?.refreshExpiresAt ?? null),
    updatedAt: now
  };

  payload.health = buildQuickBooksSecretHealth({
    payload,
    checkedAt: now,
    refreshedAt,
    lastRefreshError: null,
    lastRefreshErrorAt: null
  });

  return payload;
};

export const isQuickBooksTokenNearExpiry = (
  payload: QuickBooksSecretPayload,
  thresholdSeconds = 45
) => {
  if (!payload.expiresAt) {
    return false;
  }
  return payload.expiresAt <= Date.now() + thresholdSeconds * 1000;
};

export const isQuickBooksRefreshTokenNearExpiry = (
  payload: QuickBooksSecretPayload,
  thresholdSeconds = QUICKBOOKS_REFRESH_TOKEN_NEAR_EXPIRY_THRESHOLD_SECONDS
) => {
  if (!payload.refreshExpiresAt) {
    return false;
  }
  return payload.refreshExpiresAt <= Date.now() + thresholdSeconds * 1000;
};

export const refreshQuickBooksSecretForCompany = async (companyId: string) => {
  const existing = await loadQuickBooksSecret(companyId);
  if (!existing) {
    throw new Error('quickbooks_not_connected');
  }

  try {
    const refreshed = await refreshQuickBooksAccessToken(existing.refreshToken);
    const next = toQuickBooksSecretPayload({
      tokenResponse: refreshed,
      environment: existing.environment,
      realmId: existing.realmId,
      previous: existing
    });
    await saveQuickBooksSecret(companyId, next);
    return next;
  } catch (error) {
    const message = toQuickBooksRefreshFailureMessage(error);
    const degraded = {
      ...existing,
      updatedAt: Date.now(),
      health: buildQuickBooksSecretHealth({
        payload: existing,
        checkedAt: Date.now(),
        refreshedAt: existing.health?.refreshedAt ?? existing.updatedAt ?? null,
        lastRefreshError: message,
        lastRefreshErrorAt: Date.now()
      })
    };
    try {
      await saveQuickBooksSecret(companyId, degraded);
    } catch {
      // Preserve the original refresh error when the degraded health write cannot be saved.
    }
    throw new Error(`quickbooks_token_refresh_failed:${message}`);
  }
};

export const ensureFreshQuickBooksSecret = async (
  companyId: string,
  thresholdSeconds = 45
) => {
  const existing = await loadQuickBooksSecret(companyId);
  if (!existing) {
    return null;
  }
  if (!isQuickBooksTokenNearExpiry(existing, thresholdSeconds)) {
    return existing;
  }
  return refreshQuickBooksSecretForCompany(companyId);
};
