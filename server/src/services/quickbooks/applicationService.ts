import { randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import {
  QuickBooksSettings,
  QuickBooksSyncStatus,
  quickBooksSettingsSchema,
} from "@retailsync/shared";
import { z } from "zod";
import { env } from "../../config/env";
import { IntegrationSecretModel } from "../../models/IntegrationSecret";
import { enqueueAccountingJob } from "../../jobs/accountingQueue";
import {
  markQuickBooksSyncFailure,
  markQuickBooksSyncRunning,
} from "../quickbooksSyncService";
import { getOrCreateSettings } from "../../integrations/google/settings";
import {
  QuickBooksEnvironment,
  QuickBooksSecretHealth,
  QuickBooksSecretPayload,
  buildQuickBooksAuthorizationUrl,
  buildQuickBooksSecretHealth,
  ensureFreshQuickBooksSecret,
  exchangeQuickBooksAuthorizationCode,
  fetchQuickBooksCompanyName,
  loadQuickBooksSecret,
  runQuickBooksReadQuery,
  saveQuickBooksSecret,
  toQuickBooksSecretPayload,
} from "../../integrations/quickbooks";
import {
  ensureSubdocs,
  getOrCreateLegacySettings,
  toSafeSettings,
} from "../googleSheets/settingsService";

export const quickbooksOauthStateCookie = "quickbooksOAuthState";
export const defaultQuickBooksReturnTo = "/dashboard/accounting/quickbooks";
const quickbooksOauthStateTtlMs = 30 * 60 * 1000;
const quickbooksOauthStateTtlJwt = "30m";

export const updateQuickbooksSettingsSchema = z.object({
  environment: z.enum(["sandbox", "production"]),
});

export const quickBooksReadQuerySchema = z.object({
  query: z.string().trim().min(1).max(2000),
});

export const settingsQuickbooksMutationSchema = z.object({
  environment: z.enum(["sandbox", "production"]).optional(),
  connected: z.boolean().optional(),
  realmId: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
});

type QuickBooksSettingsState = {
  connected: boolean;
  environment: "sandbox" | "production";
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

type QuickBooksOAuthStatePayload = {
  nonce: string;
  userId: string;
  companyId: string;
  environment: QuickBooksEnvironment;
  returnTo: string;
  purpose: "quickbooks_connect";
};

type QuickBooksOAuthHealthStatus = {
  status: "healthy" | "degraded";
  checkedAt: string | null;
  refreshedAt: string | null;
  accessTokenExpiresAt: string | null;
  accessTokenExpiresInSec: number | null;
  refreshTokenExpiresAt: string | null;
  refreshTokenExpiresInSec: number | null;
  lastRefreshError: string | null;
  lastRefreshErrorAt: string | null;
};

type QuickBooksOAuthStatus = {
  ok: boolean;
  reason: string | null;
  connected: boolean;
  degraded: boolean;
  status: "not_connected" | "connected" | "degraded";
  needsReconnect: boolean;
  environment: "sandbox" | "production";
  realmId: string | null;
  companyName: string | null;
  expiresInSec: number | null;
  health: QuickBooksOAuthHealthStatus | null;
};

export const quickBooksOAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: (env.nodeEnv === "production" ? "none" : "lax") as "none" | "lax",
  secure: env.nodeEnv === "production",
  maxAge: quickbooksOauthStateTtlMs,
});

export const quickBooksOAuthClearCookieOptions = () => ({
  httpOnly: true,
  sameSite: (env.nodeEnv === "production" ? "none" : "lax") as "none" | "lax",
  secure: env.nodeEnv === "production",
});

const normalizeSyncStatus = (value: unknown): QuickBooksSyncStatus => {
  if (
    value === "idle" ||
    value === "running" ||
    value === "success" ||
    value === "error"
  ) {
    return value;
  }
  return "idle";
};

const toIsoStringOrNull = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? new Date(value).toISOString() : null;

const getQuickBooksSecretHealth = (secret: QuickBooksSecretPayload | null | undefined) => {
  if (!secret) {
    return null;
  }
  return secret.health ?? buildQuickBooksSecretHealth({ payload: secret });
};

const toQuickBooksOAuthHealthStatus = (
  health: QuickBooksSecretHealth | null,
): QuickBooksOAuthHealthStatus | null => {
  if (!health) {
    return null;
  }

  return {
    status: health.status,
    checkedAt: toIsoStringOrNull(health.checkedAt),
    refreshedAt: toIsoStringOrNull(health.refreshedAt),
    accessTokenExpiresAt: toIsoStringOrNull(health.accessTokenExpiresAt),
    accessTokenExpiresInSec: health.accessTokenExpiresInSec ?? null,
    refreshTokenExpiresAt: toIsoStringOrNull(health.refreshTokenExpiresAt),
    refreshTokenExpiresInSec: health.refreshTokenExpiresInSec ?? null,
    lastRefreshError: health.lastRefreshError ?? null,
    lastRefreshErrorAt: toIsoStringOrNull(health.lastRefreshErrorAt),
  };
};

const buildQuickBooksOAuthStatus = (args: {
  ok: boolean;
  reason: string | null;
  connected: boolean;
  environment: "sandbox" | "production";
  realmId: string | null;
  companyName: string | null;
  expiresInSec: number | null;
  health: QuickBooksSecretHealth | null;
}): QuickBooksOAuthStatus => {
  const degraded = args.health?.status === "degraded" || (!args.ok && args.connected);

  return {
    ok: args.ok,
    reason: args.reason,
    connected: args.connected,
    degraded,
    status: !args.connected ? "not_connected" : degraded ? "degraded" : "connected",
    needsReconnect: Boolean(!args.ok && args.connected),
    environment: args.environment,
    realmId: args.realmId,
    companyName: args.companyName,
    expiresInSec: args.expiresInSec,
    health: toQuickBooksOAuthHealthStatus(args.health),
  };
};

export const ensureQuickbooksShape = (settings: SettingsWithQuickBooks) => {
  if (!settings.quickbooks) {
    settings.quickbooks = {
      connected: false,
      environment: "sandbox",
      realmId: null,
      companyName: null,
      lastPullStatus: "idle",
      lastPullAt: null,
      lastPullCount: 0,
      lastPullError: null,
      lastPushStatus: "idle",
      lastPushAt: null,
      lastPushCount: 0,
      lastPushError: null,
      updatedAt: new Date(),
    };
  }
  const quickbooks = settings.quickbooks as Partial<QuickBooksSettingsState>;

  quickbooks.connected = Boolean(quickbooks.connected);
  quickbooks.environment =
    quickbooks.environment === "production" ? "production" : "sandbox";
  quickbooks.realmId =
    typeof quickbooks.realmId === "string" && quickbooks.realmId.trim().length > 0
      ? quickbooks.realmId.trim()
      : null;
  quickbooks.companyName =
    typeof quickbooks.companyName === "string" &&
    quickbooks.companyName.trim().length > 0
      ? quickbooks.companyName.trim()
      : null;
  quickbooks.lastPullStatus = normalizeSyncStatus(quickbooks.lastPullStatus);
  quickbooks.lastPushStatus = normalizeSyncStatus(quickbooks.lastPushStatus);
  quickbooks.lastPullAt =
    quickbooks.lastPullAt instanceof Date ? quickbooks.lastPullAt : null;
  quickbooks.lastPushAt =
    quickbooks.lastPushAt instanceof Date ? quickbooks.lastPushAt : null;
  quickbooks.lastPullCount = Number.isFinite(Number(quickbooks.lastPullCount))
    ? Number(quickbooks.lastPullCount)
    : 0;
  quickbooks.lastPushCount = Number.isFinite(Number(quickbooks.lastPushCount))
    ? Number(quickbooks.lastPushCount)
    : 0;
  quickbooks.lastPullError =
    typeof quickbooks.lastPullError === "string" &&
    quickbooks.lastPullError.trim().length > 0
      ? quickbooks.lastPullError.trim()
      : null;
  quickbooks.lastPushError =
    typeof quickbooks.lastPushError === "string" &&
    quickbooks.lastPushError.trim().length > 0
      ? quickbooks.lastPushError.trim()
      : null;
  quickbooks.updatedAt =
    quickbooks.updatedAt instanceof Date ? quickbooks.updatedAt : new Date();

  return quickbooks as QuickBooksSettingsState;
};

export const toQuickBooksSettings = (
  settings: SettingsWithQuickBooks,
): QuickBooksSettings => {
  const quickbooks = ensureQuickbooksShape(settings);
  return quickBooksSettingsSchema.parse({
    connected: Boolean(quickbooks.connected),
    environment:
      quickbooks.environment === "production" ? "production" : "sandbox",
    realmId: quickbooks.realmId ? String(quickbooks.realmId) : null,
    companyName: quickbooks.companyName ? String(quickbooks.companyName) : null,
    lastPullStatus: normalizeSyncStatus(quickbooks.lastPullStatus),
    lastPullAt:
      quickbooks.lastPullAt instanceof Date
        ? quickbooks.lastPullAt.toISOString()
        : null,
    lastPullCount:
      Number.isFinite(Number(quickbooks.lastPullCount))
        ? Number(quickbooks.lastPullCount)
        : 0,
    lastPullError:
      typeof quickbooks.lastPullError === "string"
        ? quickbooks.lastPullError
        : null,
    lastPushStatus: normalizeSyncStatus(quickbooks.lastPushStatus),
    lastPushAt:
      quickbooks.lastPushAt instanceof Date
        ? quickbooks.lastPushAt.toISOString()
        : null,
    lastPushCount:
      Number.isFinite(Number(quickbooks.lastPushCount))
        ? Number(quickbooks.lastPushCount)
        : 0,
    lastPushError:
      typeof quickbooks.lastPushError === "string"
        ? quickbooks.lastPushError
        : null,
    updatedAt:
      quickbooks.updatedAt instanceof Date
        ? quickbooks.updatedAt.toISOString()
        : null,
  });
};

export const normalizeQuickBooksReturnTo = (
  raw?: string | null,
  fallback = defaultQuickBooksReturnTo,
) => {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/dashboard")) return fallback;
  return value;
};

export const extractQuickBooksCallbackReason = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (normalized.includes("missing encryption_key")) return "encryption_key_missing";
  if (normalized.includes("encryption_key must be base64")) return "encryption_key_invalid";
  if (normalized.includes("quickbooks_oauth_not_configured"))
    return "quickbooks_oauth_not_configured";
  if (normalized.includes("access_token_missing")) return "access_token_missing";
  if (normalized.includes("invalid_grant")) return "quickbooks_invalid_grant";
  if (normalized.includes("invalid_client")) return "quickbooks_invalid_client";
  if (normalized.includes("access_denied")) return "quickbooks_access_denied";
  if (normalized.includes("oauth_state_mismatch")) return "oauth_state_mismatch";
  if (normalized.includes("invalid_oauth_state")) return "invalid_oauth_state";
  if (normalized.includes("realmid_missing")) return "quickbooks_realm_id_missing";
  if (normalized.includes("quickbooks_refresh_token_missing"))
    return "quickbooks_refresh_token_missing";
  return "quickbooks_oauth_callback_failed";
};

export const buildQuickBooksConnectUrl = async (params: {
  companyId: string;
  userId: string;
  returnToPath?: string;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  const quickbooks = ensureQuickbooksShape(settings);
  const environment: QuickBooksEnvironment =
    quickbooks.environment === "production" ? "production" : "sandbox";
  const returnTo = normalizeQuickBooksReturnTo(
    params.returnToPath,
    defaultQuickBooksReturnTo,
  );
  const statePayload: QuickBooksOAuthStatePayload = {
    nonce: randomBytes(12).toString("hex"),
    userId: params.userId,
    companyId: params.companyId,
    environment,
    returnTo,
    purpose: "quickbooks_connect",
  };
  const signedState = jwt.sign(statePayload, env.accessSecret, {
    algorithm: "HS256",
    expiresIn: quickbooksOauthStateTtlJwt,
  });
  const url = buildQuickBooksAuthorizationUrl(signedState);

  return {
    url,
    nonce: statePayload.nonce,
    environment,
  };
};

export const handleQuickBooksCallback = async (params: {
  code?: string;
  state?: string;
  realmId?: string;
  callbackError?: string;
  nonceFromCookie?: string;
}) => {
  const code = typeof params.code === "string" ? params.code : "";
  const state = typeof params.state === "string" ? params.state : "";
  const realmId = typeof params.realmId === "string" ? params.realmId.trim() : "";
  const callbackError =
    typeof params.callbackError === "string" ? params.callbackError : "";

  let parsedState: QuickBooksOAuthStatePayload;
  try {
    parsedState = jwt.verify(state, env.accessSecret) as QuickBooksOAuthStatePayload;
  } catch {
    return {
      returnTo: defaultQuickBooksReturnTo,
      status: "error" as const,
      reason: "invalid_oauth_state",
    };
  }

  const returnTo = normalizeQuickBooksReturnTo(
    parsedState.returnTo,
    defaultQuickBooksReturnTo,
  );
  if (parsedState.purpose !== "quickbooks_connect") {
    return { returnTo, status: "error" as const, reason: "invalid_oauth_state" };
  }

  if (
    typeof params.nonceFromCookie === "string" &&
    params.nonceFromCookie.length > 0 &&
    params.nonceFromCookie !== parsedState.nonce
  ) {
    return { returnTo, status: "error" as const, reason: "oauth_state_mismatch" };
  }

  if (callbackError) {
    return {
      returnTo,
      status: "error" as const,
      reason: "quickbooks_access_denied",
    };
  }
  if (!code || !state) {
    return {
      returnTo,
      status: "error" as const,
      reason: "missing_oauth_callback_params",
    };
  }
  if (!realmId) {
    return {
      returnTo,
      status: "error" as const,
      reason: "quickbooks_realm_id_missing",
    };
  }

  try {
    const tokenResponse = await exchangeQuickBooksAuthorizationCode(code);
    const existing = await loadQuickBooksSecret(parsedState.companyId);
    const quickbooksSecret = toQuickBooksSecretPayload({
      tokenResponse,
      environment: parsedState.environment,
      realmId,
      previous: existing,
    });
    const companyName = await fetchQuickBooksCompanyName({
      environment: parsedState.environment,
      realmId,
      accessToken: quickbooksSecret.accessToken,
    });
    quickbooksSecret.companyName = companyName ?? quickbooksSecret.companyName;
    await saveQuickBooksSecret(parsedState.companyId, quickbooksSecret);

    const settings = await getOrCreateSettings(
      parsedState.companyId,
      parsedState.userId,
    );
    const quickbooks = ensureQuickbooksShape(settings);
    quickbooks.connected = true;
    quickbooks.environment = parsedState.environment;
    quickbooks.realmId = realmId;
    quickbooks.companyName = companyName ?? quickbooks.companyName ?? null;
    quickbooks.updatedAt = new Date();
    await settings.save();

    return { returnTo, status: "connected" as const };
  } catch (error) {
    return {
      returnTo,
      status: "error" as const,
      reason: extractQuickBooksCallbackReason(error),
    };
  }
};

export const getQuickBooksOAuthStatus = async (
  companyId: string,
  userId: string,
) => {
  const settings = await getOrCreateSettings(companyId, userId);
  const quickbooks = ensureQuickbooksShape(settings);

  try {
    if (!quickbooks.connected) {
      return buildQuickBooksOAuthStatus({
        ok: false,
        reason: "not_connected",
        connected: false,
        environment: quickbooks.environment,
        realmId: null,
        companyName: null,
        expiresInSec: null,
        health: null,
      });
    }

    const secret = await ensureFreshQuickBooksSecret(companyId);
    if (!secret) {
      return buildQuickBooksOAuthStatus({
        ok: false,
        reason: "quickbooks_secret_missing",
        connected: true,
        environment: quickbooks.environment,
        realmId: quickbooks.realmId ?? null,
        companyName: quickbooks.companyName ?? null,
        expiresInSec: null,
        health: null,
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

    const health = getQuickBooksSecretHealth(secret);

    return buildQuickBooksOAuthStatus({
      ok: true,
      reason: null,
      connected: true,
      environment: secret.environment,
      realmId: secret.realmId,
      companyName: secret.companyName,
      expiresInSec: health?.accessTokenExpiresInSec ?? null,
      health,
    });
  } catch (error) {
    const secret = quickbooks.connected ? await loadQuickBooksSecret(companyId) : null;
    const health = getQuickBooksSecretHealth(secret);

    return buildQuickBooksOAuthStatus({
      ok: false,
      reason: extractQuickBooksCallbackReason(error),
      connected: quickbooks.connected,
      environment:
        secret?.environment === "production" || quickbooks.environment === "production"
          ? "production"
          : "sandbox",
      realmId: secret?.realmId ?? quickbooks.realmId ?? null,
      companyName: secret?.companyName ?? quickbooks.companyName ?? null,
      expiresInSec: health?.accessTokenExpiresInSec ?? null,
      health,
    });
  }
};

export const getQuickBooksSettings = async (
  companyId: string,
  userId: string,
) => {
  const settings = await getOrCreateSettings(companyId, userId);
  return toQuickBooksSettings(settings);
};

export const queueQuickBooksSync = async (params: {
  companyId: string;
  userId: string;
  jobType: "quickbooks.refresh_reference_data" | "quickbooks.post_approved";
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  const quickbooks = ensureQuickbooksShape(settings);
  if (!quickbooks.connected) {
    throw new Error("QuickBooks is not connected");
  }

  try {
    await markQuickBooksSyncRunning(params.companyId, params.jobType);
    const queue = await enqueueAccountingJob({
      companyId: params.companyId,
      jobType: params.jobType,
      meta: {
        requestedBy: params.userId,
      },
    });
    const refreshed = await getOrCreateSettings(params.companyId, params.userId);
    return { queue, quickbooks: toQuickBooksSettings(refreshed) };
  } catch (error) {
    await markQuickBooksSyncFailure(
      params.companyId,
      params.jobType,
      String((error as Error).message),
    );
    throw error;
  }
};

export const updateQuickBooksSettings = async (params: {
  companyId: string;
  userId: string;
  environment: "sandbox" | "production";
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  const quickbooks = ensureQuickbooksShape(settings);
  quickbooks.environment = params.environment;
  quickbooks.updatedAt = new Date();
  await settings.save();
  return toQuickBooksSettings(settings);
};

export const disconnectQuickBooks = async (
  companyId: string,
  userId: string,
) => {
  await IntegrationSecretModel.findOneAndDelete({
    companyId,
    provider: "quickbooks_oauth",
  });
  const settings = await getOrCreateSettings(companyId, userId);
  const quickbooks = ensureQuickbooksShape(settings);
  quickbooks.connected = false;
  quickbooks.realmId = null;
  quickbooks.companyName = null;
  quickbooks.lastPullStatus = "idle";
  quickbooks.lastPullAt = null;
  quickbooks.lastPullCount = 0;
  quickbooks.lastPullError = null;
  quickbooks.lastPushStatus = "idle";
  quickbooks.lastPushAt = null;
  quickbooks.lastPushCount = 0;
  quickbooks.lastPushError = null;
  quickbooks.updatedAt = new Date();
  await settings.save();

  return toQuickBooksSettings(settings);
};

export const quickBooksReadQueryForCompany = async (
  companyId: string,
  query: string,
) => {
  const payload = await runQuickBooksReadQuery(companyId, query);
  return { query, payload };
};

export const updateLegacyQuickbooksSettings = async (params: {
  companyId: string;
  userId: string;
  environment?: "sandbox" | "production";
  connected?: boolean;
  realmId?: string | null;
  companyName?: string | null;
}) => {
  const settings = ensureSubdocs(
    await getOrCreateLegacySettings(params.companyId, params.userId),
  );
  if (params.environment) settings.quickbooks.environment = params.environment;
  if (params.connected !== undefined) settings.quickbooks.connected = params.connected;
  settings.quickbooks.realmId = params.realmId ? String(params.realmId) : null;
  settings.quickbooks.companyName = params.companyName
    ? String(params.companyName)
    : null;
  settings.quickbooks.updatedAt = new Date();
  await settings.save();
  return toSafeSettings(settings);
};

export const disconnectLegacyQuickbooksSettings = async (
  companyId: string,
  userId: string,
) => {
  await IntegrationSecretModel.findOneAndDelete({
    companyId,
    provider: "quickbooks_oauth",
  });
  const settings = ensureSubdocs(await getOrCreateLegacySettings(companyId, userId));
  settings.quickbooks.connected = false;
  settings.quickbooks.realmId = null;
  settings.quickbooks.companyName = null;
  settings.quickbooks.lastPullStatus = "idle";
  settings.quickbooks.lastPullAt = null;
  settings.quickbooks.lastPullCount = 0;
  settings.quickbooks.lastPullError = null;
  settings.quickbooks.lastPushStatus = "idle";
  settings.quickbooks.lastPushAt = null;
  settings.quickbooks.lastPushCount = 0;
  settings.quickbooks.lastPushError = null;
  settings.quickbooks.updatedAt = new Date();
  await settings.save();
  return toSafeSettings(settings);
};
