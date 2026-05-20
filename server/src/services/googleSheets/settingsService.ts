import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { z } from "zod";
import { getSheetsClientForCompany } from "../../integrations/google/sheets.client";
import { loadGoogleOAuthSecret } from "../../integrations/google/oauth";
import { ensureSharedSheets, pickDefaultSharedSheet } from "../../integrations/google/sharedSheets";
import { IntegrationSettingsModel } from "../../models/IntegrationSettings";
import { IntegrationSecretModel } from "../../models/IntegrationSecret";
import { POSDailySummaryModel } from "../../models/POSDailySummary";
import { normalizeUtcOffset } from "../../utils/utcOffset";
import { GoogleSheetsApplicationError } from "./errors";
import { getGoogleSheetsSettingsView } from "./managementService";

export const DEFAULT_RANGE = "Sheet1!A1:Z";
export const SERVICE_ACCOUNT_EMAIL =
  "retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com";
export const DEFAULT_SYNC_UTC_OFFSET = "UTC-08:00";

export const googleSheetsModeSchema = z.object({
  mode: z.enum(["service_account", "oauth"]),
});

export const upsertGoogleSourceSchema = z.object({
  spreadsheetId: z.string().trim().min(1),
  spreadsheetTitle: z.string().optional().default(""),
  range: z.string().trim().min(1).default(DEFAULT_RANGE),
  name: z.string().trim().min(1).default("POS Sheet"),
  sourceId: z.string().optional().default(""),
  sheetGid: z.string().optional().default(""),
  active: z.boolean().optional().default(false),
  mapping: z.record(z.string(), z.unknown()).optional(),
  transformations: z.record(z.string(), z.unknown()).optional(),
});

export const testGoogleSheetAccessSchema = z.object({
  spreadsheetId: z.string().trim().min(1),
  range: z.string().trim().min(1).default(DEFAULT_RANGE),
  authMode: z.enum(["oauth", "service_account"]).optional().default("service_account"),
});

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveSyncTimezone = (value: unknown) => {
  if (typeof value !== "string") return DEFAULT_SYNC_UTC_OFFSET;
  return normalizeUtcOffset(value) ?? DEFAULT_SYNC_UTC_OFFSET;
};

export const toSafeSettings = (doc: any) => {
  const sourceSchedule = doc.googleSheets.syncSchedule ?? {};
  return {
    id: doc._id.toString(),
    companyId: doc.companyId.toString(),
    ownerUserId: doc.ownerUserId.toString(),
    googleSheets: {
      mode: doc.googleSheets.mode,
      serviceAccountEmail: doc.googleSheets.serviceAccountEmail,
      connected: doc.googleSheets.connected,
      connectedEmail: doc.googleSheets.connectedEmail,
      sharedSheets: doc.googleSheets.sharedSheets ?? [],
      sharedConfig: doc.googleSheets.sharedConfig,
      syncSchedule: {
        enabled: Boolean(sourceSchedule.enabled),
        hour: Number.isFinite(sourceSchedule.hour) ? Number(sourceSchedule.hour) : 2,
        minute: Number.isFinite(sourceSchedule.minute) ? Number(sourceSchedule.minute) : 0,
        timezone: resolveSyncTimezone(sourceSchedule.timezone),
      },
      lastScheduledSyncAt: doc.googleSheets.lastScheduledSyncAt ?? null,
      updatedAt: doc.googleSheets.updatedAt,
      sources: doc.googleSheets.sources,
    },
    quickbooks: doc.quickbooks,
    lastImportSource: doc.lastImportSource ?? null,
    lastImportAt: doc.lastImportAt ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
};

export const ensureSubdocs = (settings: any) => {
  if (!settings.googleSheets) {
    settings.googleSheets = {
      mode: "service_account",
      serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
      connected: false,
      connectedEmail: null,
      sharedSheets: [],
      sharedConfig: {
        spreadsheetId: null,
        sheetName: "Sheet1",
        sheetId: null,
        headerRow: 1,
        columnsMap: {},
        enabled: false,
        shareStatus: "unknown",
        oauthConnectedAccount: null,
        lastMapping: null,
        lastVerifiedAt: null,
        lastImportAt: null,
      },
      syncSchedule: {
        enabled: false,
        hour: 2,
        minute: 0,
        timezone: DEFAULT_SYNC_UTC_OFFSET,
      },
      lastScheduledSyncAt: null,
      sources: [],
      updatedAt: new Date(),
    };
  }

  if (!Array.isArray(settings.googleSheets.sharedSheets)) {
    settings.googleSheets.sharedSheets = [];
  }

  if (!settings.googleSheets.sharedConfig) {
    settings.googleSheets.sharedConfig = {
      spreadsheetId: null,
      sheetName: "Sheet1",
      sheetId: null,
      headerRow: 1,
      columnsMap: {},
      enabled: false,
      shareStatus: "unknown",
      oauthConnectedAccount: null,
      lastMapping: null,
      lastVerifiedAt: null,
      lastImportAt: null,
    };
  }

  if (!settings.googleSheets.syncSchedule) {
    settings.googleSheets.syncSchedule = {
      enabled: false,
      hour: 2,
      minute: 0,
      timezone: DEFAULT_SYNC_UTC_OFFSET,
    };
  }
  settings.googleSheets.syncSchedule.timezone = resolveSyncTimezone(
    settings.googleSheets.syncSchedule.timezone,
  );
  if (typeof settings.googleSheets.lastScheduledSyncAt === "undefined") {
    settings.googleSheets.lastScheduledSyncAt = null;
  }

  ensureSharedSheets(settings.googleSheets);

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
  if (typeof settings.quickbooks.lastPullStatus !== "string") settings.quickbooks.lastPullStatus = "idle";
  if (typeof settings.quickbooks.lastPullCount !== "number") settings.quickbooks.lastPullCount = 0;
  if (typeof settings.quickbooks.lastPullAt === "undefined") settings.quickbooks.lastPullAt = null;
  if (typeof settings.quickbooks.lastPullError === "undefined") settings.quickbooks.lastPullError = null;
  if (typeof settings.quickbooks.lastPushStatus !== "string") settings.quickbooks.lastPushStatus = "idle";
  if (typeof settings.quickbooks.lastPushCount !== "number") settings.quickbooks.lastPushCount = 0;
  if (typeof settings.quickbooks.lastPushAt === "undefined") settings.quickbooks.lastPushAt = null;
  if (typeof settings.quickbooks.lastPushError === "undefined") settings.quickbooks.lastPushError = null;

  return settings;
};

export const getOrCreateLegacySettings = async (companyId: string, userId: string) =>
  IntegrationSettingsModel.findOneAndUpdate(
    { companyId },
    {
      $setOnInsert: {
        ownerUserId: userId,
        googleSheets: {
          mode: "service_account",
          connected: false,
          connectedEmail: null,
          sharedSheets: [],
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          sharedConfig: {
            spreadsheetId: null,
            sheetName: "Sheet1",
            sheetId: null,
            headerRow: 1,
            columnsMap: {},
            enabled: false,
            shareStatus: "unknown",
            oauthConnectedAccount: null,
            lastMapping: null,
            lastVerifiedAt: null,
            lastImportAt: null,
          },
          syncSchedule: {
            enabled: false,
            hour: 2,
            minute: 0,
            timezone: DEFAULT_SYNC_UTC_OFFSET,
          },
          lastScheduledSyncAt: null,
          sources: [],
          updatedAt: new Date(),
        },
        quickbooks: {
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
        },
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );

export const getSettingsPayload = async (companyId: string, userId: string) => {
  const base = await getGoogleSheetsSettingsView(companyId, userId);
  const settings = ensureSubdocs(await getOrCreateLegacySettings(companyId, userId));
  const googleSheets = settings.googleSheets as Record<string, unknown>;

  let connectedEmail: string | null = null;
  try {
    const secret = await loadGoogleOAuthSecret(companyId);
    connectedEmail =
      typeof secret?.connectedEmail === "string" && secret.connectedEmail.trim()
        ? secret.connectedEmail.trim()
        : null;
  } catch {
    connectedEmail =
      typeof googleSheets.connectedEmail === "string"
        ? googleSheets.connectedEmail
        : null;
  }

  const oauthConnected =
    base.googleSheets.oauth.connectionStatus === "connected" ||
    Boolean(googleSheets.connected);

  return {
    ...base,
    googleSheets: {
      ...base.googleSheets,
      mode:
        base.googleSheets.activeIntegration === "oauth"
          ? "oauth"
          : "service_account",
      serviceAccountEmail: String(
        googleSheets.serviceAccountEmail ?? SERVICE_ACCOUNT_EMAIL,
      ),
      connected: oauthConnected,
      connectedEmail,
      syncSchedule: googleSheets.syncSchedule ?? {
        enabled: false,
        hour: 2,
        minute: 0,
        timezone: DEFAULT_SYNC_UTC_OFFSET,
      },
      lastScheduledSyncAt:
        googleSheets.lastScheduledSyncAt ??
        base.googleSheets.shared.lastScheduledSyncAt ??
        null,
      sources: Array.isArray(googleSheets.sources) ? googleSheets.sources : [],
      sharedSheets: Array.isArray(googleSheets.sharedSheets)
        ? googleSheets.sharedSheets
        : [],
      sharedConfig: googleSheets.sharedConfig ?? null,
    },
  };
};

export const getGoogleSheetsSyncOverview = async (companyId: string) => {
  const aggregateCompanyId = Types.ObjectId.isValid(companyId)
    ? new Types.ObjectId(companyId)
    : companyId;

  const [overview] = await POSDailySummaryModel.aggregate([
    { $match: { companyId: aggregateCompanyId, source: "google_sheets" } },
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        lastUpdatedAt: { $max: "$updatedAt" },
      },
    },
    { $project: { _id: 0, totalEntries: 1, lastUpdatedAt: 1 } },
  ]);

  const byProfile = await POSDailySummaryModel.aggregate([
    { $match: { companyId: aggregateCompanyId, source: "google_sheets" } },
    {
      $group: {
        _id: { $ifNull: ["$sourceRef.profileName", "UNSPECIFIED"] },
        entries: { $sum: 1 },
        lastUpdatedAt: { $max: "$updatedAt" },
      },
    },
    {
      $project: {
        _id: 0,
        profileName: "$_id",
        entries: 1,
        lastUpdatedAt: 1,
      },
    },
    { $sort: { profileName: 1 } },
  ]);

  return {
    totalEntries: Number(overview?.totalEntries ?? 0),
    lastUpdatedAt: overview?.lastUpdatedAt ?? null,
    byProfile: Array.isArray(byProfile) ? byProfile : [],
  };
};

export const setGoogleMode = async (params: {
  companyId: string;
  userId: string;
  mode: "service_account" | "oauth";
}) => {
  const settings = ensureSubdocs(
    await getOrCreateLegacySettings(params.companyId, params.userId),
  );
  settings.googleSheets.mode = params.mode;
  if (params.mode === "service_account") {
    const defaultShared = pickDefaultSharedSheet(settings.googleSheets);
    if (defaultShared && !defaultShared.isDefault) defaultShared.isDefault = true;
    ensureSharedSheets(settings.googleSheets);
  }
  settings.googleSheets.updatedAt = new Date();
  await settings.save();
  return toSafeSettings(settings);
};

export const upsertGoogleSource = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof upsertGoogleSourceSchema>;
}) => {
  const { input } = params;
  if (input.mapping !== undefined && !isObjectRecord(input.mapping)) {
    throw new GoogleSheetsApplicationError("mapping must be an object", 400);
  }
  if (input.transformations !== undefined && !isObjectRecord(input.transformations)) {
    throw new GoogleSheetsApplicationError("transformations must be an object", 400);
  }

  const settings = ensureSubdocs(
    await getOrCreateLegacySettings(params.companyId, params.userId),
  );
  const nextSourceId = input.sourceId || randomUUID();
  const existingSource =
    settings.googleSheets.sources.find((item: { sourceId: string }) => item.sourceId === nextSourceId) ?? null;
  const mapping = isObjectRecord(input.mapping)
    ? Object.fromEntries(
        Object.entries(input.mapping).map(([key, value]) => [key, String(value)]),
      )
    : {};
  const transformations = isObjectRecord(input.transformations)
    ? Object.fromEntries(Object.entries(input.transformations))
    : {};
  const source = {
    sourceId: nextSourceId,
    name: input.name,
    spreadsheetTitle:
      input.spreadsheetTitle ||
      (existingSource ? String((existingSource as any).spreadsheetTitle ?? "") : "") ||
      null,
    spreadsheetId: input.spreadsheetId,
    sheetGid: input.sheetGid || null,
    range: input.range,
    mapping,
    transformations,
    active: input.active === true,
  };

  const existingIndex = settings.googleSheets.sources.findIndex(
    (item: { sourceId: string }) => item.sourceId === nextSourceId,
  );
  if (existingIndex >= 0) {
    settings.googleSheets.sources[existingIndex] = source as any;
  } else {
    settings.googleSheets.sources.push(source as any);
  }

  if (input.active === true) {
    settings.googleSheets.sources = settings.googleSheets.sources.map(
      (item: { sourceId: string; active: boolean }) => ({
        ...item,
        active: item.sourceId === nextSourceId,
      }),
    ) as any;
  }

  settings.googleSheets.updatedAt = new Date();
  ensureSharedSheets(settings.googleSheets);
  await settings.save();
  return toSafeSettings(settings);
};

export const testGoogleSheetAccess = async (params: {
  companyId: string;
  input: z.infer<typeof testGoogleSheetAccessSchema>;
}) => {
  const sheets = await getSheetsClientForCompany(params.input.authMode, params.companyId);
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: params.input.spreadsheetId,
    range: params.input.range,
  });
  const rows = (result.data.values ?? []).map((row) =>
    row.map((cell) => String(cell ?? "")),
  );
  return {
    spreadsheetId: params.input.spreadsheetId,
    range: params.input.range,
    authMode: params.input.authMode,
    rowCount: rows.length,
    preview: rows.slice(0, 10),
  };
};

export const disconnectGoogle = async (companyId: string, userId: string) => {
  await IntegrationSecretModel.findOneAndDelete({
    companyId,
    provider: "google_oauth",
  });
  const settings = ensureSubdocs(await getOrCreateLegacySettings(companyId, userId));
  settings.googleSheets.connected = false;
  settings.googleSheets.connectedEmail = null;
  if (settings.googleSheets.oauth) {
    settings.googleSheets.oauth.enabled = false;
    settings.googleSheets.oauth.connectionStatus = "not_connected";
  }
  ensureSharedSheets(settings.googleSheets);
  settings.googleSheets.updatedAt = new Date();
  await settings.save();
  return getSettingsPayload(companyId, userId);
};

export const resetGoogleSheetsIntegration = async (
  companyId: string,
  userId: string,
) => {
  const settings = ensureSubdocs(await getOrCreateLegacySettings(companyId, userId));
  settings.googleSheets.connected = false;
  settings.googleSheets.connectedEmail = null;
  if (Array.isArray(settings.googleSheets.sharedSheets)) {
    settings.googleSheets.sharedSheets = settings.googleSheets.sharedSheets.map((sheet: any) => ({
      ...sheet,
      enabled: false,
      spreadsheetId: null,
      sheetName: "Sheet1",
      headerRow: 1,
      columnsMap: {},
      lastMapping: null,
      lastVerifiedAt: null,
      lastImportAt: null,
    }));
  }
  if (settings.googleSheets.sharedConfig) {
    settings.googleSheets.sharedConfig.enabled = false;
    settings.googleSheets.sharedConfig.spreadsheetId = null;
    settings.googleSheets.sharedConfig.sheetName = "Sheet1";
    settings.googleSheets.sharedConfig.headerRow = 1;
    settings.googleSheets.sharedConfig.columnsMap = {};
    settings.googleSheets.sharedConfig.lastMapping = null;
    settings.googleSheets.sharedConfig.lastVerifiedAt = null;
    settings.googleSheets.sharedConfig.lastImportAt = null;
  }
  settings.googleSheets.sources = [];
  settings.googleSheets.activeIntegration = null;
  settings.googleSheets.oauth = {
    ...(settings.googleSheets.oauth ?? {}),
    enabled: false,
    connectionStatus: "not_connected",
    activeSourceId: null,
    activeConnectorKey: "pos_daily",
    sources: [],
    lastDebugResult: null,
    lastImportAt: null,
  };
  settings.googleSheets.shared = {
    ...(settings.googleSheets.shared ?? {}),
    enabled: false,
    activeProfileId: null,
    activeConnectorKey: "pos_daily",
    profiles: [],
    lastDebugResult: null,
    lastImportAt: null,
    lastScheduledSyncAt: null,
  };
  ensureSharedSheets(settings.googleSheets);
  settings.googleSheets.updatedAt = new Date();
  await settings.save();
  return toSafeSettings(settings);
};
