import { randomBytes } from "node:crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { IntegrationSecretModel } from "../models/IntegrationSecret";
import { IntegrationSettingsModel } from "../models/IntegrationSettings";
import { decryptJson, encryptJson } from "../utils/encryption";
import { fail, ok } from "../utils/apiResponse";
import { google } from "googleapis";
import {
  ensureGoogleSheetsShape,
  getOrCreateSettings,
} from "../utils/googleSheetsSettings";
const sheetsOauthStateCookie = "googleSheetsOAuthState";
const SHEETS_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
] as const;

type GoogleSheetsStatePayload = {
  nonce: string;
  userId: string;
  companyId: string;
  purpose: "google_sheets_connect";
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
    return { error: "Unauthorized" as const };
  }
  if (!env.encryptionKey) {
    return { error: "ENCRYPTION_KEY is missing on the server." as const };
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return {
      error:
        "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_INTEGRATION_REDIRECT_URI." as const,
    };
  }

  const statePayload: GoogleSheetsStatePayload = {
    nonce: randomBytes(12).toString("hex"),
    userId: req.user.id,
    companyId: req.user.companyId,
    purpose: "google_sheets_connect",
  };
  const signedState = jwt.sign(statePayload, env.accessSecret, {
    algorithm: "HS256",
    expiresIn: "10m",
  });
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    // Force account chooser so users can switch Google accounts during reconnect.
    prompt: "consent select_account",
    scope: [...SHEETS_SCOPES],
    state: signedState,
  });

  return { url, nonce: statePayload.nonce };
};

export const startGoogleSheetsConnect = async (req: Request, res: Response) => {
  const built = buildGoogleOauthUrl(req);
  if ("error" in built) {
    const status = built.error === "Unauthorized" ? 401 : 501;
    const message = built.error ?? "Google OAuth setup failed";
    return fail(res, message, status);
  }

  res.cookie(sheetsOauthStateCookie, built.nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 10 * 60 * 1000,
  });
  return res.redirect(built.url);
};

export const getGoogleSheetsConnectUrl = async (
  req: Request,
  res: Response,
) => {
  const built = buildGoogleOauthUrl(req);
  if ("error" in built) {
    const status = built.error === "Unauthorized" ? 401 : 501;
    const message = built.error ?? "Google OAuth setup failed";
    return fail(res, message, status);
  }

  res.cookie(sheetsOauthStateCookie, built.nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: 10 * 60 * 1000,
  });
  return ok(res, { url: built.url });
};

const settingsRedirectBase = `${env.clientUrl}/dashboard/settings`;

const redirectWithStatus = (
  res: Response,
  status: "connected" | "error",
  reason?: string,
) => {
  if (status === "connected") {
    console.info("[GoogleSheets OAuth] callback success", {
      status,
      reason: reason ?? null,
    });
  } else {
    console.error("[GoogleSheets OAuth] callback failed", {
      status,
      reason: reason ?? "unknown",
    });
  }
  const qs = new URLSearchParams({ googleSheets: status });
  if (reason) qs.set("reason", reason);
  return res.redirect(`${settingsRedirectBase}?${qs.toString()}`);
};

const extractOauthCallbackReason = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("missing encryption_key"))
    return "encryption_key_missing";
  if (normalized.includes("encryption_key must be base64"))
    return "encryption_key_invalid";
  if (normalized.includes("invalid_grant")) return "google_invalid_grant";
  if (normalized.includes("redirect_uri_mismatch"))
    return "google_redirect_uri_mismatch";
  if (normalized.includes("invalid_client")) return "google_invalid_client";
  if (normalized.includes("access_denied")) return "google_access_denied";
  if (normalized.includes("unauthorized_client"))
    return "google_unauthorized_client";
  if (
    normalized.includes("would create a conflict") ||
    normalized.includes("conflictingupdateoperators")
  ) {
    return "google_settings_conflict";
  }
  if (normalized.includes("e11000")) return "google_settings_conflict";
  return "google_oauth_callback_failed";
};

export const googleSheetsCallback = async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  console.log(state);
  if (!code || !state) {
    return redirectWithStatus(res, "error", "missing_oauth_callback_params");
  }

  const nonceFromCookie = req.cookies?.[sheetsOauthStateCookie];
  res.clearCookie(sheetsOauthStateCookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
  });

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return redirectWithStatus(res, "error", "google_oauth_not_configured");
  }

  let parsedState: GoogleSheetsStatePayload;
  try {
    parsedState = jwt.verify(
      state,
      env.accessSecret,
    ) as GoogleSheetsStatePayload;
  } catch {
    return redirectWithStatus(res, "error", "invalid_oauth_state");
  }

  if (
    parsedState.purpose !== "google_sheets_connect" ||
    !nonceFromCookie ||
    nonceFromCookie !== parsedState.nonce
  ) {
    return redirectWithStatus(res, "error", "oauth_state_mismatch");
  }

  try {
    const tokenRes = await oauthClient.getToken(code);
    const tokens = tokenRes.tokens;

    if (!tokens.access_token) {
      return redirectWithStatus(res, "error", "access_token_missing");
    }

    // Never overwrite refreshToken with undefined: keep existing if Google didn't return one
    let refreshTokenToStore: string | null = tokens.refresh_token ?? null;
    if (refreshTokenToStore == null) {
      const existing = await IntegrationSecretModel.findOne({
        companyId: parsedState.companyId,
        provider: "google_oauth",
      }).select("+encryptedPayload");
      if (existing?.encryptedPayload) {
        try {
          const { decryptJson } = await import("../utils/encryption");
          const prev = decryptJson<{ refreshToken?: string | null }>(
            existing.encryptedPayload,
            env.encryptionKey,
          );
          if (prev.refreshToken) refreshTokenToStore = prev.refreshToken;
        } catch {
          // ignore decrypt errors
        }
      }
    }

    // Fetch OAuth user email for connectedEmail
    oauthClient.setCredentials({
      access_token: tokens.access_token,
      refresh_token: refreshTokenToStore ?? undefined,
      expiry_date: tokens.expiry_date ?? undefined,
    });
    let connectedEmail: string | null = null;
    try {
      if (typeof tokens.id_token === "string" && env.googleOAuthClientId) {
        const ticket = await oauthClient.verifyIdToken({
          idToken: tokens.id_token,
          audience: env.googleOAuthClientId,
        });
        connectedEmail =
          (ticket.getPayload()?.email as string | undefined) ?? null;
      } else {
        const oauth2 = google.oauth2({ version: "v2", auth: oauthClient });
        const userInfo = await oauth2.userinfo.get();
        connectedEmail = (userInfo.data.email as string) ?? null;
      }
    } catch {
      // non-fatal
    }

    await IntegrationSecretModel.findOneAndUpdate(
      { companyId: parsedState.companyId, provider: "google_oauth" },
      {
        $set: {
          encryptedPayload: encryptJson(
            {
              accessToken: tokens.access_token,
              refreshToken: refreshTokenToStore,
              expiryDate: tokens.expiry_date ?? null,
              scope: tokens.scope ?? null,
              tokenType: tokens.token_type ?? null,
              connectedEmail,
            },
            env.encryptionKey,
          ),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    const settings = await getOrCreateSettings(
      parsedState.companyId,
      parsedState.userId,
    );
    ensureGoogleSheetsShape(settings);
    settings.ownerUserId = parsedState.userId as any;
    (settings.googleSheets as any).oauth.enabled = true;
    (settings.googleSheets as any).oauth.connectionStatus = "connected";
    (settings.googleSheets as any).updatedAt = new Date();
    await settings.save();

    return redirectWithStatus(res, "connected");
  } catch (error) {
    console.error("[GoogleSheets OAuth] callback exception", error);
    return redirectWithStatus(res, "error", extractOauthCallbackReason(error));
  }
};

export const listOAuthSpreadsheets = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }

  try {
    const drive = await (
      await import("../integrations/google/sheets.client")
    ).getDriveClientForCompany(companyId);

    const q =
      "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    const response = await drive.files.list({
      q,
      orderBy: "modifiedTime desc",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields:
        "files(id,name,mimeType,modifiedTime,owners(displayName,emailAddress),iconLink)",
    });

    const files = (response.data.files ?? [])
      .filter(
        (f) =>
          !!f.id &&
          !!f.name &&
          f.mimeType === "application/vnd.google-apps.spreadsheet",
      )
      .map((f) => ({
        id: f.id as string,
        name: f.name as string,
        mimeType: f.mimeType ?? null,
        modifiedTime: f.modifiedTime ?? null,
        ownerEmail: (f.owners?.[0] as any)?.emailAddress ?? null,
        iconLink: f.iconLink ?? null,
      }));

    return ok(res, { files });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list spreadsheets";
    return fail(res, message, 400);
  }
};

/** Check if OAuth tokens are valid (e.g. for showing "Working" vs "Re-authorization needed"). */
export const getGoogleSheetsOAuthStatus = async (
  req: Request,
  res: Response,
) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }

  const settings = await IntegrationSettingsModel.findOne({ companyId })
    .select("googleSheets.oauth")
    .lean();
  const oauth = (settings?.googleSheets as any)?.oauth ?? {};
  const connected = oauth.connectionStatus === "connected";

  const secret = await IntegrationSecretModel.findOne({
    companyId,
    provider: "google_oauth",
  })
    .select("+encryptedPayload")
    .lean();
  if (!connected || !secret?.encryptedPayload) {
    return ok(res, {
      ok: false,
      reason: "not_connected",
      email: null,
      scopes: null,
      expiresInSec: null,
    });
  }

  let cachedEmail: string | null = null;
  let scopes: string[] | null = null;
  let expiresInSec: number | null = null;
  try {
    const payload = decryptJson<{
      connectedEmail?: string | null;
      scope?: string | null;
      expiryDate?: number | null;
    }>(secret.encryptedPayload, env.encryptionKey);
    cachedEmail =
      typeof payload.connectedEmail === "string" &&
      payload.connectedEmail.trim().length > 0
        ? payload.connectedEmail.trim()
        : null;
    scopes =
      typeof payload.scope === "string" && payload.scope.trim().length > 0
        ? payload.scope.split(/\s+/).filter(Boolean)
        : null;
    if (
      typeof payload.expiryDate === "number" &&
      Number.isFinite(payload.expiryDate)
    ) {
      expiresInSec = Math.max(
        0,
        Math.floor((payload.expiryDate - Date.now()) / 1000),
      );
    }
  } catch {
    // Best-effort metadata; token validation still runs below.
  }

  try {
    const { getDriveClientForCompany, getOAuthClientForCompany } =
      await import("../integrations/google/sheets.client");
    const drive = await getDriveClientForCompany(companyId);
    await drive.files.list({
      pageSize: 1,
      fields: "files(id)",
    });

    let resolvedEmail = cachedEmail;
    if (!resolvedEmail) {
      try {
        const about = await drive.about.get({ fields: "user(emailAddress)" });
        resolvedEmail =
          typeof about.data.user?.emailAddress === "string" &&
          about.data.user.emailAddress.trim().length > 0
            ? about.data.user.emailAddress.trim()
            : null;
      } catch {
        // Fallback to oauth userinfo below.
      }

      if (!resolvedEmail) {
        try {
          const oauthClient = await getOAuthClientForCompany(companyId);
          const oauth2 = google.oauth2({ version: "v2", auth: oauthClient });
          const userInfo = await oauth2.userinfo.get();
          resolvedEmail =
            typeof userInfo.data.email === "string" &&
            userInfo.data.email.trim().length > 0
              ? userInfo.data.email.trim()
              : null;
        } catch {
          // Non-fatal: status remains OK without resolved email.
        }
      }

      if (resolvedEmail) {
        try {
          const payload = decryptJson<Record<string, unknown>>(
            secret.encryptedPayload,
            env.encryptionKey,
          );
          const nextPayload = { ...payload, connectedEmail: resolvedEmail };
          await IntegrationSecretModel.updateOne(
            { companyId, provider: "google_oauth" },
            {
              $set: {
                encryptedPayload: encryptJson(nextPayload, env.encryptionKey),
              },
            },
          );
        } catch {
          // Non-fatal: status can still return resolvedEmail.
        }
      }
    }

    return ok(res, {
      ok: true,
      reason: null,
      email: resolvedEmail,
      scopes,
      expiresInSec,
    });
  } catch {
    return ok(res, {
      ok: false,
      reason: "token_invalid",
      email: cachedEmail,
      scopes,
      expiresInSec,
    });
  }
};

// Backward-compatible exports for existing /api/google/* routes.
export const connectGoogle = startGoogleSheetsConnect;
export const connectGoogleUrl = getGoogleSheetsConnectUrl;
export const googleCallback = googleSheetsCallback;
