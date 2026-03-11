import { randomBytes } from 'node:crypto';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import {
  QuickBooksSettings,
  QuickBooksSyncStatus,
  quickBooksSettingsSchema
} from '@retailsync/shared';
import { z } from 'zod';
import { env } from '../config/env';
import { IntegrationSecretModel } from '../models/IntegrationSecret';
import { enqueueAccountingJob } from '../jobs/accountingQueue';
import {
  markQuickBooksSyncFailure,
  markQuickBooksSyncRunning
} from '../services/quickbooksSyncService';
import { fail, ok } from '../utils/apiResponse';
import { getOrCreateSettings } from '../utils/googleSheetsSettings';
import {
  QuickBooksEnvironment,
  buildQuickBooksAuthorizationUrl,
  ensureFreshQuickBooksSecret,
  exchangeQuickBooksAuthorizationCode,
  fetchQuickBooksCompanyName,
  loadQuickBooksSecret,
  runQuickBooksReadQuery,
  saveQuickBooksSecret,
  toQuickBooksSecretPayload
} from '../services/quickbooksService';

const quickbooksOauthStateCookie = 'quickbooksOAuthState';
const defaultReturnTo = '/dashboard/accounting/quickbooks';
const quickbooksOauthStateTtlMs = 30 * 60 * 1000;
const quickbooksOauthStateTtlJwt = '30m';

const oauthStateCookieBaseOptions = () => ({
  httpOnly: true,
  sameSite: (env.nodeEnv === 'production' ? 'none' : 'lax') as 'none' | 'lax',
  secure: env.nodeEnv === 'production'
});

const setQuickBooksOAuthStateCookie = (res: Response, nonce: string) => {
  res.cookie(quickbooksOauthStateCookie, nonce, {
    ...oauthStateCookieBaseOptions(),
    maxAge: quickbooksOauthStateTtlMs
  });
};

const clearQuickBooksOAuthStateCookie = (res: Response) => {
  res.clearCookie(quickbooksOauthStateCookie, oauthStateCookieBaseOptions());
};

const updateQuickbooksSettingsSchema = z.object({
  environment: z.enum(['sandbox', 'production'])
});

const quickBooksReadQuerySchema = z.object({
  query: z.string().trim().min(1).max(2000)
});

type QuickBooksSettingsState = {
  connected: boolean;
  environment: 'sandbox' | 'production';
  realmId: string | null;
  companyName: string | null;
  lastPullStatus: QuickBooksSyncStatus;
  lastPullAt: Date | null;
  lastPullCount: number;
  lastPullError: string | null;
  lastPushStatus: QuickBooksSyncStatus;
  lastPushAt: Date | null;
  lastPushCount: number;
  lastPushError: string | null;
  updatedAt: Date;
};

type SettingsWithQuickBooks = {
  quickbooks?: Partial<QuickBooksSettingsState> | null;
};

const normalizeSyncStatus = (value: unknown): QuickBooksSyncStatus => {
  if (
    value === 'idle' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error'
  ) {
    return value;
  }
  return 'idle';
};

const ensureQuickbooksShape = (settings: SettingsWithQuickBooks) => {
  if (!settings.quickbooks) {
    settings.quickbooks = {
      connected: false,
      environment: 'sandbox',
      realmId: null,
      companyName: null,
      lastPullStatus: 'idle',
      lastPullAt: null,
      lastPullCount: 0,
      lastPullError: null,
      lastPushStatus: 'idle',
      lastPushAt: null,
      lastPushCount: 0,
      lastPushError: null,
      updatedAt: new Date()
    };
  }
  const quickbooks = settings.quickbooks as Partial<QuickBooksSettingsState>;

  quickbooks.connected = Boolean(quickbooks.connected);
  quickbooks.environment =
    quickbooks.environment === 'production' ? 'production' : 'sandbox';
  quickbooks.realmId =
    typeof quickbooks.realmId === 'string' && quickbooks.realmId.trim().length > 0
      ? quickbooks.realmId.trim()
      : null;
  quickbooks.companyName =
    typeof quickbooks.companyName === 'string' && quickbooks.companyName.trim().length > 0
      ? quickbooks.companyName.trim()
      : null;
  quickbooks.lastPullStatus = normalizeSyncStatus(quickbooks.lastPullStatus);
  quickbooks.lastPushStatus = normalizeSyncStatus(quickbooks.lastPushStatus);
  quickbooks.lastPullAt = quickbooks.lastPullAt instanceof Date ? quickbooks.lastPullAt : null;
  quickbooks.lastPushAt = quickbooks.lastPushAt instanceof Date ? quickbooks.lastPushAt : null;
  quickbooks.lastPullCount = Number.isFinite(Number(quickbooks.lastPullCount))
    ? Number(quickbooks.lastPullCount)
    : 0;
  quickbooks.lastPushCount = Number.isFinite(Number(quickbooks.lastPushCount))
    ? Number(quickbooks.lastPushCount)
    : 0;
  quickbooks.lastPullError =
    typeof quickbooks.lastPullError === 'string' && quickbooks.lastPullError.trim().length > 0
      ? quickbooks.lastPullError.trim()
      : null;
  quickbooks.lastPushError =
    typeof quickbooks.lastPushError === 'string' && quickbooks.lastPushError.trim().length > 0
      ? quickbooks.lastPushError.trim()
      : null;
  quickbooks.updatedAt = quickbooks.updatedAt instanceof Date ? quickbooks.updatedAt : new Date();

  return quickbooks as QuickBooksSettingsState;
};

type QuickBooksOAuthStatePayload = {
  nonce: string;
  userId: string;
  companyId: string;
  environment: QuickBooksEnvironment;
  returnTo: string;
  purpose: 'quickbooks_connect';
};

const normalizeReturnTo = (raw?: string | null, fallback = defaultReturnTo) => {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith('/dashboard')) return fallback;
  return value;
};

const redirectWithStatus = (
  res: Response,
  returnTo: string,
  status: 'connected' | 'error',
  reason?: string
) => {
  const params = new URLSearchParams({ quickbooks: status });
  if (reason) {
    params.set('reason', reason);
  }
  return res.redirect(`${env.clientUrl}${returnTo}?${params.toString()}`);
};

const extractQuickBooksCallbackReason = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  if (normalized.includes('missing encryption_key')) return 'encryption_key_missing';
  if (normalized.includes('encryption_key must be base64')) return 'encryption_key_invalid';
  if (normalized.includes('quickbooks_oauth_not_configured')) return 'quickbooks_oauth_not_configured';
  if (normalized.includes('access_token_missing')) return 'access_token_missing';
  if (normalized.includes('invalid_grant')) return 'quickbooks_invalid_grant';
  if (normalized.includes('invalid_client')) return 'quickbooks_invalid_client';
  if (normalized.includes('access_denied')) return 'quickbooks_access_denied';
  if (normalized.includes('oauth_state_mismatch')) return 'oauth_state_mismatch';
  if (normalized.includes('invalid_oauth_state')) return 'invalid_oauth_state';
  if (normalized.includes('realmid_missing')) return 'quickbooks_realm_id_missing';
  if (normalized.includes('quickbooks_refresh_token_missing')) return 'quickbooks_refresh_token_missing';
  return 'quickbooks_oauth_callback_failed';
};

const toQuickBooksSettings = (settings: SettingsWithQuickBooks): QuickBooksSettings => {
  const quickbooks = ensureQuickbooksShape(settings);
  return quickBooksSettingsSchema.parse({
    connected: Boolean(quickbooks.connected),
    environment: quickbooks.environment === 'production' ? 'production' : 'sandbox',
    realmId: quickbooks.realmId ? String(quickbooks.realmId) : null,
    companyName: quickbooks.companyName ? String(quickbooks.companyName) : null,
    lastPullStatus: normalizeSyncStatus(quickbooks.lastPullStatus),
    lastPullAt:
      quickbooks.lastPullAt instanceof Date ? quickbooks.lastPullAt.toISOString() : null,
    lastPullCount:
      Number.isFinite(Number(quickbooks.lastPullCount)) ? Number(quickbooks.lastPullCount) : 0,
    lastPullError:
      typeof quickbooks.lastPullError === 'string' ? quickbooks.lastPullError : null,
    lastPushStatus: normalizeSyncStatus(quickbooks.lastPushStatus),
    lastPushAt:
      quickbooks.lastPushAt instanceof Date ? quickbooks.lastPushAt.toISOString() : null,
    lastPushCount:
      Number.isFinite(Number(quickbooks.lastPushCount)) ? Number(quickbooks.lastPushCount) : 0,
    lastPushError:
      typeof quickbooks.lastPushError === 'string' ? quickbooks.lastPushError : null,
    updatedAt:
      quickbooks.updatedAt instanceof Date ? quickbooks.updatedAt.toISOString() : null
  });
};

const buildQuickBooksConnectUrl = async (
  req: Request,
  returnToPath = defaultReturnTo
) => {
  if (!req.user?.id || !req.user.companyId) {
    throw new Error('Unauthorized');
  }

  const settings = await getOrCreateSettings(req.user.companyId, req.user.id);
  const quickbooks = ensureQuickbooksShape(settings);
  const environment: QuickBooksEnvironment =
    quickbooks.environment === 'production' ? 'production' : 'sandbox';
  const returnTo = normalizeReturnTo(returnToPath, defaultReturnTo);
  const statePayload: QuickBooksOAuthStatePayload = {
    nonce: randomBytes(12).toString('hex'),
    userId: req.user.id,
    companyId: req.user.companyId,
    environment,
    returnTo,
    purpose: 'quickbooks_connect'
  };
  const signedState = jwt.sign(statePayload, env.accessSecret, {
    algorithm: 'HS256',
    expiresIn: quickbooksOauthStateTtlJwt
  });
  const url = buildQuickBooksAuthorizationUrl(signedState);

  return {
    url,
    nonce: statePayload.nonce,
    environment
  };
};

export const createQuickBooksConnectUrlResponse = async (
  req: Request,
  res: Response,
  returnToPath?: string
) => {
  try {
    const built = await buildQuickBooksConnectUrl(req, returnToPath);
    setQuickBooksOAuthStateCookie(res, built.nonce);
    return ok(res, { url: built.url, environment: built.environment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks OAuth setup failed';
    const status = message === 'Unauthorized' ? 401 : 501;
    return fail(res, message, status);
  }
};

export const getQuickBooksConnectUrl = async (req: Request, res: Response) => {
  const returnTo =
    typeof req.query.returnTo === 'string' ? req.query.returnTo : defaultReturnTo;
  return createQuickBooksConnectUrlResponse(req, res, returnTo);
};

export const startQuickBooksConnect = async (req: Request, res: Response) => {
  try {
    const returnTo =
      typeof req.query.returnTo === 'string' ? req.query.returnTo : defaultReturnTo;
    const built = await buildQuickBooksConnectUrl(req, returnTo);
    setQuickBooksOAuthStateCookie(res, built.nonce);
    return res.redirect(built.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks OAuth setup failed';
    const status = message === 'Unauthorized' ? 401 : 501;
    return fail(res, message, status);
  }
};

export const quickBooksCallback = async (req: Request, res: Response) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const realmId = typeof req.query.realmId === 'string' ? req.query.realmId.trim() : '';
  const callbackError = typeof req.query.error === 'string' ? req.query.error : '';

  const nonceFromCookie = req.cookies?.[quickbooksOauthStateCookie];
  clearQuickBooksOAuthStateCookie(res);

  let parsedState: QuickBooksOAuthStatePayload;
  try {
    parsedState = jwt.verify(state, env.accessSecret) as QuickBooksOAuthStatePayload;
  } catch {
    return redirectWithStatus(res, defaultReturnTo, 'error', 'invalid_oauth_state');
  }

  const returnTo = normalizeReturnTo(parsedState.returnTo, defaultReturnTo);
  if (parsedState.purpose !== 'quickbooks_connect') {
    return redirectWithStatus(res, returnTo, 'error', 'invalid_oauth_state');
  }

  if (
    typeof nonceFromCookie === 'string' &&
    nonceFromCookie.length > 0 &&
    nonceFromCookie !== parsedState.nonce
  ) {
    return redirectWithStatus(res, returnTo, 'error', 'oauth_state_mismatch');
  }

  if (callbackError) {
    return redirectWithStatus(res, returnTo, 'error', 'quickbooks_access_denied');
  }

  if (!code || !state) {
    return redirectWithStatus(res, returnTo, 'error', 'missing_oauth_callback_params');
  }

  if (!realmId) {
    return redirectWithStatus(res, returnTo, 'error', 'quickbooks_realm_id_missing');
  }

  try {
    const tokenResponse = await exchangeQuickBooksAuthorizationCode(code);
    const existing = await loadQuickBooksSecret(parsedState.companyId);
    const quickbooksSecret = toQuickBooksSecretPayload({
      tokenResponse,
      environment: parsedState.environment,
      realmId,
      previous: existing
    });
    const companyName = await fetchQuickBooksCompanyName({
      environment: parsedState.environment,
      realmId,
      accessToken: quickbooksSecret.accessToken
    });
    quickbooksSecret.companyName = companyName ?? quickbooksSecret.companyName;
    await saveQuickBooksSecret(parsedState.companyId, quickbooksSecret);

    const settings = await getOrCreateSettings(parsedState.companyId, parsedState.userId);
    const quickbooks = ensureQuickbooksShape(settings);
    quickbooks.connected = true;
    quickbooks.environment = parsedState.environment;
    quickbooks.realmId = realmId;
    quickbooks.companyName = companyName ?? quickbooks.companyName ?? null;
    quickbooks.updatedAt = new Date();
    await settings.save();

    return redirectWithStatus(res, returnTo, 'connected');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[quickbooks.callback] failed', error);
    return redirectWithStatus(
      res,
      returnTo,
      'error',
      extractQuickBooksCallbackReason(error)
    );
  }
};

export const getQuickBooksOAuthStatus = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  try {
    const settings = await getOrCreateSettings(req.companyId, req.user.id);
    const quickbooks = ensureQuickbooksShape(settings);
    if (!quickbooks.connected) {
      return ok(res, {
        ok: false,
        reason: 'not_connected',
        realmId: null,
        companyName: null,
        expiresInSec: null
      });
    }

    const secret = await ensureFreshQuickBooksSecret(req.companyId);
    if (!secret) {
      return ok(res, {
        ok: false,
        reason: 'quickbooks_secret_missing',
        realmId: quickbooks.realmId ?? null,
        companyName: quickbooks.companyName ?? null,
        expiresInSec: null
      });
    }

    if (secret.companyName && quickbooks.companyName !== secret.companyName) {
      quickbooks.companyName = secret.companyName;
      quickbooks.updatedAt = new Date();
      await settings.save();
    }
    if (quickbooks.realmId !== secret.realmId) {
      quickbooks.realmId = secret.realmId;
      quickbooks.updatedAt = new Date();
      await settings.save();
    }

    const expiresInSec = secret.expiresAt
      ? Math.max(0, Math.floor((secret.expiresAt - Date.now()) / 1000))
      : null;

    return ok(res, {
      ok: true,
      reason: null,
      environment: secret.environment,
      realmId: secret.realmId,
      companyName: secret.companyName,
      expiresInSec
    });
  } catch (error) {
    const reason = extractQuickBooksCallbackReason(error);
    return ok(res, {
      ok: false,
      reason,
      realmId: null,
      companyName: null,
      expiresInSec: null
    });
  }
};

export const getQuickBooksSettings = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }
  const settings = await getOrCreateSettings(req.companyId, req.user.id);
  return ok(res, toQuickBooksSettings(settings));
};

export const queueQuickBooksRefreshReferenceData = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }
  const settings = await getOrCreateSettings(req.companyId, req.user.id);
  const quickbooks = ensureQuickbooksShape(settings);
  if (!quickbooks.connected) {
    return fail(res, 'QuickBooks is not connected', 409);
  }

  try {
    await markQuickBooksSyncRunning(req.companyId, 'quickbooks.refresh_reference_data');
    const queue = await enqueueAccountingJob({
      companyId: req.companyId,
      jobType: 'quickbooks.refresh_reference_data',
      meta: {
        requestedBy: req.user.id
      }
    });
    const refreshed = await getOrCreateSettings(req.companyId, req.user.id);
    return ok(res, { queue, quickbooks: toQuickBooksSettings(refreshed) });
  } catch (error) {
    await markQuickBooksSyncFailure(
      req.companyId,
      'quickbooks.refresh_reference_data',
      String((error as Error).message)
    );
    return fail(res, 'Failed to queue QuickBooks reference sync', 500, {
      error: String((error as Error).message)
    });
  }
};

export const queueQuickBooksPostApproved = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }
  const settings = await getOrCreateSettings(req.companyId, req.user.id);
  const quickbooks = ensureQuickbooksShape(settings);
  if (!quickbooks.connected) {
    return fail(res, 'QuickBooks is not connected', 409);
  }

  try {
    await markQuickBooksSyncRunning(req.companyId, 'quickbooks.post_approved');
    const queue = await enqueueAccountingJob({
      companyId: req.companyId,
      jobType: 'quickbooks.post_approved',
      meta: {
        requestedBy: req.user.id
      }
    });
    const refreshed = await getOrCreateSettings(req.companyId, req.user.id);
    return ok(res, { queue, quickbooks: toQuickBooksSettings(refreshed) });
  } catch (error) {
    await markQuickBooksSyncFailure(
      req.companyId,
      'quickbooks.post_approved',
      String((error as Error).message)
    );
    return fail(res, 'Failed to queue QuickBooks post-approved sync', 500, {
      error: String((error as Error).message)
    });
  }
};

export const updateQuickBooksSettings = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = updateQuickbooksSettingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const settings = await getOrCreateSettings(req.companyId, req.user.id);
  const quickbooks = ensureQuickbooksShape(settings);
  quickbooks.environment = parsed.data.environment;
  quickbooks.updatedAt = new Date();
  await settings.save();
  return ok(res, toQuickBooksSettings(settings));
};

export const disconnectQuickBooks = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  await IntegrationSecretModel.findOneAndDelete({
    companyId: req.companyId,
    provider: 'quickbooks_oauth'
  });
  const settings = await getOrCreateSettings(req.companyId, req.user.id);
  const quickbooks = ensureQuickbooksShape(settings);
  quickbooks.connected = false;
  quickbooks.realmId = null;
  quickbooks.companyName = null;
  quickbooks.lastPullStatus = 'idle';
  quickbooks.lastPullAt = null;
  quickbooks.lastPullCount = 0;
  quickbooks.lastPullError = null;
  quickbooks.lastPushStatus = 'idle';
  quickbooks.lastPushAt = null;
  quickbooks.lastPushCount = 0;
  quickbooks.lastPushError = null;
  quickbooks.updatedAt = new Date();
  await settings.save();

  return ok(res, toQuickBooksSettings(settings));
};

export const quickBooksReadQuery = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = quickBooksReadQuerySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const payload = await runQuickBooksReadQuery(req.companyId, parsed.data.query);
    return ok(res, { query: parsed.data.query, payload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks query failed';
    const status =
      message === 'quickbooks_not_connected'
        ? 409
        : message === 'quickbooks_query_must_be_select'
          ? 422
          : 500;
    return fail(res, message, status);
  }
};
