import { randomUUID } from "node:crypto";
import { Request, Response } from "express";
import { google } from "googleapis";
import { env } from "../config/env";
import { IntegrationSettingsModel } from "../models/IntegrationSettings";
import { IntegrationSecretModel } from "../models/IntegrationSecret";
import { decryptJson } from "../utils/encryption";
import { fail, ok } from "../utils/apiResponse";

const DEFAULT_RANGE = "Sheet1!A1:Z";
const SERVICE_ACCOUNT_EMAIL =
  "retialsync@lively-infinity-488304-m9.iam.gserviceaccount.com";

type GoogleOAuthSecret = {
  accessToken: string;
  refreshToken?: string;
  expiryDate?: number;
  tokenType?: string;
  scope?: string;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toSafeSettings = (doc: any) => ({
  id: doc._id.toString(),
  companyId: doc.companyId.toString(),
  ownerUserId: doc.ownerUserId.toString(),
  googleSheets: {
    mode: doc.googleSheets.mode,
    serviceAccountEmail: doc.googleSheets.serviceAccountEmail,
    connected: doc.googleSheets.connected,
    connectedEmail: doc.googleSheets.connectedEmail,
    updatedAt: doc.googleSheets.updatedAt,
    sources: doc.googleSheets.sources,
  },
  quickbooks: doc.quickbooks,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
});

const ensureSubdocs = (settings: any) => {
  if (!settings.googleSheets) {
    settings.googleSheets = {
      mode: "service_account",
      serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
      connected: false,
      connectedEmail: null,
      sources: [],
      updatedAt: new Date(),
    };
  }

  if (!settings.quickbooks) {
    settings.quickbooks = {
      connected: false,
      environment: "sandbox",
      realmId: null,
      companyName: null,
      updatedAt: new Date(),
    };
  }

  return settings;
};

const getOrCreateSettings = async (req: Request) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    throw new Error("Company onboarding required");
  }

  const doc = await IntegrationSettingsModel.findOneAndUpdate(
    { companyId },
    {
      $setOnInsert: {
        ownerUserId: userId,
        googleSheets: {
          mode: "service_account",
          connected: false,
          connectedEmail: null,
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          sources: [],
          updatedAt: new Date(),
        },
        quickbooks: {
          connected: false,
          environment: "sandbox",
          realmId: null,
          companyName: null,
          updatedAt: new Date(),
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

  return doc;
};

const loadGoogleAuthClient = async (
  authMode: "service_account" | "oauth",
  companyId: string,
) => {
  if (authMode === "service_account") {
    if (!env.googleServiceAccountJson) {
      throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON on server");
    }
    const credentials = JSON.parse(env.googleServiceAccountJson) as Record<
      string,
      unknown
    >;
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  if (
    !env.googleOAuthClientId ||
    !env.googleOAuthClientSecret ||
    !env.googleOAuthRedirectUri
  ) {
    throw new Error("Google OAuth is not configured on server");
  }

  const secretDoc = await IntegrationSecretModel.findOne({
    companyId,
    provider: "google_oauth",
  }).select("+encryptedPayload");

  if (!secretDoc?.encryptedPayload) {
    throw new Error("Google OAuth tokens not found. Connect Google first.");
  }

  const tokenPayload = decryptJson<GoogleOAuthSecret>(
    secretDoc.encryptedPayload,
    env.encryptionKey,
  );

  const oauthClient = new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleOAuthRedirectUri,
  );
  oauthClient.setCredentials({
    access_token: tokenPayload.accessToken,
    refresh_token: tokenPayload.refreshToken,
    expiry_date: tokenPayload.expiryDate,
    token_type: tokenPayload.tokenType,
    scope: tokenPayload.scope,
  });

  return oauthClient;
};

export const getSettings = async (req: Request, res: Response) => {
  try {
    const settings = ensureSubdocs(await getOrCreateSettings(req));
    return ok(res, toSafeSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load settings";
    return fail(res, message, 400);
  }
};

export const setGoogleMode = async (req: Request, res: Response) => {
  const mode = req.body?.mode;
  if (mode !== "service_account" && mode !== "oauth") {
    return fail(res, "mode must be service_account or oauth", 400);
  }

  try {
    const settings = ensureSubdocs(await getOrCreateSettings(req));
    settings.googleSheets.mode = mode;
    settings.googleSheets.updatedAt = new Date();
    await settings.save();
    return ok(res, toSafeSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update google mode";
    return fail(res, message, 400);
  }
};

export const upsertGoogleSource = async (req: Request, res: Response) => {
  const spreadsheetId = String(req.body?.spreadsheetId ?? "").trim();
  const range = String(req.body?.range ?? DEFAULT_RANGE).trim();
  const name = String(req.body?.name ?? "POS Sheet").trim();
  const sourceId = String(req.body?.sourceId ?? "").trim();
  const sheetGid = String(req.body?.sheetGid ?? "").trim();
  const active = req.body?.active === true;
  const mappingInput = req.body?.mapping;

  if (!spreadsheetId) {
    return fail(res, "spreadsheetId is required", 400);
  }
  if (!range) {
    return fail(res, "range is required", 400);
  }
  if (!name) {
    return fail(res, "name is required", 400);
  }
  if (mappingInput !== undefined && !isObjectRecord(mappingInput)) {
    return fail(res, "mapping must be an object", 400);
  }

  try {
    const settings = ensureSubdocs(await getOrCreateSettings(req));
    const nextSourceId = sourceId || randomUUID();
    const mapping = isObjectRecord(mappingInput)
      ? Object.fromEntries(
          Object.entries(mappingInput).map(([key, value]) => [
            key,
            String(value),
          ]),
        )
      : {};
    const source = {
      sourceId: nextSourceId,
      name,
      spreadsheetId,
      sheetGid: sheetGid || null,
      range,
      mapping,
      active,
    };

    const existingIndex = settings.googleSheets.sources.findIndex(
      (item: { sourceId: string }) => item.sourceId === nextSourceId,
    );
    if (existingIndex >= 0) {
      settings.googleSheets.sources[existingIndex] = source as any;
    } else {
      settings.googleSheets.sources.push(source as any);
    }

    if (active) {
      settings.googleSheets.sources = settings.googleSheets.sources.map(
        (item: { sourceId: string; active: boolean }) => ({
          ...item,
          active: item.sourceId === nextSourceId,
        }),
      ) as any;
    }

    settings.googleSheets.updatedAt = new Date();
    await settings.save();
    return ok(res, toSafeSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save Google source";
    return fail(res, message, 400);
  }
};

export const testGoogleSheetAccess = async (req: Request, res: Response) => {
  const spreadsheetId = String(req.body?.spreadsheetId ?? "").trim();
  const range = String(req.body?.range ?? DEFAULT_RANGE).trim();
  const authMode = req.body?.authMode === "oauth" ? "oauth" : "service_account";
  const companyId = req.user?.companyId;

  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }
  if (!spreadsheetId) {
    return fail(res, "spreadsheetId is required", 400);
  }
  if (!range) {
    return fail(res, "range is required", 400);
  }

  try {
    const auth = await loadGoogleAuthClient(authMode, companyId);
    const sheets = google.sheets({ version: "v4", auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    const rows = (result.data.values ?? []).map((row) =>
      row.map((cell) => String(cell ?? "")),
    );
    return ok(res, {
      spreadsheetId,
      range,
      authMode,
      rowCount: rows.length,
      preview: rows.slice(0, 10),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Google Sheets access check failed";
    const statusCode =
      /permission|forbidden|insufficient|not found|access/i.test(message)
        ? 403
        : 500;
    return fail(res, message, statusCode);
  }
};

export const setQuickbooksSettings = async (req: Request, res: Response) => {
  const environment = req.body?.environment;
  const connected = req.body?.connected;
  const realmId = req.body?.realmId ?? null;
  const companyName = req.body?.companyName ?? null;

  if (
    environment !== undefined &&
    environment !== "sandbox" &&
    environment !== "production"
  ) {
    return fail(res, "environment must be sandbox or production", 400);
  }
  if (connected !== undefined && typeof connected !== "boolean") {
    return fail(res, "connected must be boolean", 400);
  }

  try {
    const settings = ensureSubdocs(await getOrCreateSettings(req));
    if (environment) settings.quickbooks.environment = environment;
    if (connected !== undefined) settings.quickbooks.connected = connected;
    settings.quickbooks.realmId = realmId ? String(realmId) : null;
    settings.quickbooks.companyName = companyName ? String(companyName) : null;
    settings.quickbooks.updatedAt = new Date();
    await settings.save();
    return ok(res, toSafeSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update QuickBooks settings";
    return fail(res, message, 400);
  }
};

export const disconnectGoogle = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }

  try {
    await IntegrationSecretModel.findOneAndDelete({
      companyId,
      provider: "google_oauth",
    });
    const settings = ensureSubdocs(await getOrCreateSettings(req));
    settings.googleSheets.connected = false;
    settings.googleSheets.connectedEmail = null;
    settings.googleSheets.updatedAt = new Date();
    await settings.save();
    return ok(res, toSafeSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to disconnect Google";
    return fail(res, message, 400);
  }
};

export const disconnectQuickbooks = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }

  try {
    await IntegrationSecretModel.findOneAndDelete({
      companyId,
      provider: "quickbooks_oauth",
    });
    const settings = ensureSubdocs(await getOrCreateSettings(req));
    settings.quickbooks.connected = false;
    settings.quickbooks.realmId = null;
    settings.quickbooks.companyName = null;
    settings.quickbooks.updatedAt = new Date();
    await settings.save();
    return ok(res, toSafeSettings(settings));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to disconnect QuickBooks";
    return fail(res, message, 400);
  }
};

export const connectQuickbooksPlaceholder = async (
  _req: Request,
  res: Response,
) => {
  return fail(res, "QuickBooks OAuth is not implemented yet", 501);
};
