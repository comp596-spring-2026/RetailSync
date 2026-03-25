import { Types } from "mongoose";
import { z } from "zod";
import { getOAuthClientForCompany } from "../../integrations/google/sheets.client";
import {
  computeCompatibilityForConnector,
  type CompatibilityReport,
  validateColumnMapOneToOne,
} from "../../integrations/google/compatibility";
import {
  DEFAULT_CONNECTOR_KEY,
  getConnectorDefinition,
} from "../../integrations/google/connectors";
import {
  asObjectId,
  createDefaultConnector,
  ensureGoogleSheetsShape,
  getOrCreateSettings,
  idEquals,
  mapToPlain,
  normalizeTransformations,
} from "../../integrations/google/settings";
import {
  readSheetSampleOAuth,
  readSheetSampleShared,
} from "../../integrations/google/sheetsReader";
import {
  resolveActiveSheetsConfig,
  resolveSheetsConfigByRef,
  type ResolvedSheetsConfig,
} from "../../integrations/google/sourceResolver";
import { IntegrationSettingsModel } from "../../models/IntegrationSettings";
import { suggestMappings } from "../../utils/matching";
import { GoogleSheetsApplicationError } from "./errors";

export type IntegrationType = "oauth" | "shared";

export type DebugResult = {
  ok: boolean;
  integrationType: IntegrationType;
  connectorKey?: string;
  checkedAt: string;
  auth: {
    ok: boolean;
    details?: string;
    scopes?: string[];
    expiresInSec?: number;
  };
  sheet: {
    ok: boolean;
    spreadsheetId?: string;
    sheetName?: string;
    details?: string;
  };
  header: {
    ok: boolean;
    headerRow?: number;
    columns?: string[];
  };
  mapping: {
    ok: boolean;
    details?: string;
    missingTargets?: string[];
    duplicateTargets?: string[];
  };
  sample: {
    ok: boolean;
    rowCount?: number;
    details?: string;
  };
};

export const connectorInputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  spreadsheetId: z.string().min(5),
  spreadsheetTitle: z.string().min(1).optional(),
  sheetName: z.string().min(1),
  headerRow: z.coerce.number().int().min(1).default(1),
  mapping: z.record(z.string(), z.string()).default({}),
  transformations: z.record(z.string(), z.unknown()).optional(),
  mappingConfirmedAt: z.string().datetime().optional(),
  mappingHash: z.string().min(1).optional(),
  schedule: z
    .object({
      enabled: z.boolean().default(false),
      frequency: z
        .enum(["hourly", "daily", "weekly", "manual"])
        .default("manual"),
      timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    })
    .optional(),
});

export const connectorPatchSchema = z.object({
  label: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  spreadsheetId: z.string().min(5).optional(),
  spreadsheetTitle: z.string().min(1).optional(),
  sheetName: z.string().min(1).optional(),
  headerRow: z.coerce.number().int().min(1).optional(),
  mapping: z.record(z.string(), z.string()).optional(),
  transformations: z.record(z.string(), z.unknown()).optional(),
  mappingConfirmedAt: z.string().datetime().nullable().optional(),
  mappingHash: z.string().min(1).nullable().optional(),
  schedule: z
    .object({
      enabled: z.boolean().optional(),
      frequency: z.enum(["hourly", "daily", "weekly", "manual"]).optional(),
      timeOfDay: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    })
    .optional(),
});

export const createOAuthSourceSchema = z.object({
  name: z.string().min(1),
  connectors: z.array(connectorInputSchema).min(1),
});

export const createSharedProfileSchema = z.object({
  name: z.string().min(1),
  connectors: z.array(connectorInputSchema).min(1),
});

export const activateSchema = z.object({
  integrationType: z.enum(["oauth", "shared"]),
  sourceId: z.string().optional(),
  profileId: z.string().optional(),
  connectorKey: z.string().optional(),
});

export const debugOAuthSchema = z.object({
  sourceId: z.string().optional(),
  connectorKey: z.string().optional(),
});

export const debugSharedSchema = z.object({
  profileId: z.string().optional(),
  connectorKey: z.string().optional(),
});

export const stageChangeSchema = z.object({
  connectorKey: z.string().default(DEFAULT_CONNECTOR_KEY),
  sourceType: z.enum(["oauth", "shared"]),
  sourceId: z.string().optional(),
  profileId: z.string().optional(),
  spreadsheetId: z.string().min(5),
  spreadsheetTitle: z.string().min(1).optional(),
  sheetName: z.string().min(1).optional(),
  tab: z.string().min(1).optional(),
  headerRow: z.coerce.number().int().min(1).default(1),
  mapping: z.record(z.string(), z.string()).optional(),
  transformations: z.record(z.string(), z.unknown()).optional(),
});

export const commitChangeSchema = z.object({
  connectorKey: z.string().default(DEFAULT_CONNECTOR_KEY),
  sourceType: z.enum(["oauth", "shared"]),
  sourceId: z.string().optional(),
  profileId: z.string().optional(),
  sourceName: z.string().min(1).optional(),
  profileName: z.string().min(1).optional(),
  spreadsheetId: z.string().min(5),
  spreadsheetTitle: z.string().min(1).optional(),
  sheetName: z.string().min(1).optional(),
  tab: z.string().min(1).optional(),
  headerRow: z.coerce.number().int().min(1).default(1),
  mapping: z.record(z.string(), z.string()).default({}),
  transformations: z.record(z.string(), z.unknown()).optional(),
  mappingConfirmedAt: z.string().datetime().nullable().optional(),
  mappingHash: z.string().min(1).nullable().optional(),
  activate: z.boolean().default(true),
});

const POS_MAPPING_TARGET_FIELDS = [
  "date",
  "day",
  "highTax",
  "lowTax",
  "saleTax",
  "totalSales",
  "gas",
  "lottery",
  "creditCard",
  "lotteryPayout",
  "creditPlusLottery",
  "cashDiff",
  "cashPayout",
  "clTotal",
  "cash",
  "cashExpenses",
  "notes",
];

const toConnectorResponse = (connector: any) => ({
  key: String(connector.key),
  label: String(
    connector.label ?? getConnectorDefinition(String(connector.key)).label,
  ),
  enabled: Boolean(connector.enabled),
  spreadsheetId: String(connector.spreadsheetId ?? ""),
  spreadsheetTitle: connector.spreadsheetTitle
    ? String(connector.spreadsheetTitle)
    : null,
  sheetName: String(connector.sheetName ?? ""),
  headerRow: Number(connector.headerRow ?? 1),
  mapping: mapToPlain(connector.mapping),
  transformations: normalizeTransformations(connector.transformations),
  mappingConfirmedAt: connector.mappingConfirmedAt ?? null,
  mappingHash: connector.mappingHash ? String(connector.mappingHash) : null,
  schedule: connector.schedule
    ? {
        enabled: Boolean(connector.schedule.enabled),
        frequency: connector.schedule.frequency,
        timeOfDay: connector.schedule.timeOfDay,
        dayOfWeek: connector.schedule.dayOfWeek,
      }
    : undefined,
  lastDebugResult: connector.lastDebugResult ?? null,
  lastImportAt: connector.lastImportAt ?? null,
  createdAt: connector.createdAt ?? null,
  updatedAt: connector.updatedAt ?? null,
});

const toSourceResponse = (source: any) => ({
  id: source._id?.toString?.() ?? String(source._id ?? ""),
  name: String(source.name ?? ""),
  connectors: Array.isArray(source.connectors)
    ? source.connectors.map(toConnectorResponse)
    : [],
  lastDebugResult: source.lastDebugResult ?? null,
  createdAt: source.createdAt ?? null,
  updatedAt: source.updatedAt ?? null,
});

const toProfileResponse = (profile: any) => ({
  id: profile._id?.toString?.() ?? String(profile._id ?? ""),
  name: String(profile.name ?? ""),
  connectors: Array.isArray(profile.connectors)
    ? profile.connectors.map(toConnectorResponse)
    : [],
  lastDebugResult: profile.lastDebugResult ?? null,
  createdAt: profile.createdAt ?? null,
  updatedAt: profile.updatedAt ?? null,
});

const normalizeConnectorPayload = (
  input: z.infer<typeof connectorInputSchema>,
) => {
  const definition = getConnectorDefinition(input.key);
  const mapping = Object.fromEntries(
    Object.entries(input.mapping ?? {}).map(([column, target]) => [
      String(column),
      String(target),
    ]),
  );

  return {
    key: String(input.key).trim(),
    label: String(input.label ?? definition.label).trim() || definition.label,
    enabled: input.enabled,
    spreadsheetId: String(input.spreadsheetId).trim(),
    spreadsheetTitle: input.spreadsheetTitle
      ? String(input.spreadsheetTitle).trim()
      : undefined,
    sheetName: String(input.sheetName).trim(),
    headerRow: Number(input.headerRow ?? 1),
    mapping,
    transformations: normalizeTransformations(input.transformations),
    mappingConfirmedAt: input.mappingConfirmedAt
      ? new Date(input.mappingConfirmedAt)
      : undefined,
    mappingHash: input.mappingHash
      ? String(input.mappingHash).trim()
      : undefined,
    schedule: input.schedule
      ? {
          enabled: Boolean(input.schedule.enabled),
          frequency: input.schedule.frequency,
          timeOfDay: input.schedule.timeOfDay,
          dayOfWeek: input.schedule.dayOfWeek,
        }
      : undefined,
  };
};

const readSheetSampleByIntegration = async (
  companyId: string,
  integrationType: IntegrationType,
  connector: {
    spreadsheetId: string;
    sheetName: string;
    headerRow?: number;
  },
) =>
  integrationType === "oauth"
    ? readSheetSampleOAuth(
        companyId,
        connector.spreadsheetId,
        connector.sheetName,
        Number(connector.headerRow ?? 1),
        30,
      )
    : readSheetSampleShared(
        companyId,
        connector.spreadsheetId,
        connector.sheetName,
        Number(connector.headerRow ?? 1),
        30,
      );

const validateConnectorCompatibility = async (
  companyId: string,
  integrationType: IntegrationType,
  connector: {
    key: string;
    spreadsheetId: string;
    sheetName: string;
    headerRow?: number;
    mapping: Record<string, string>;
  },
) => {
  const oneToOne = validateColumnMapOneToOne(connector.mapping);
  if (!oneToOne.ok) {
    return {
      sample: null,
      compatibility: {
        status: "error",
        missingColumns: [],
        missingTargets: [],
        duplicateTargets: oneToOne.duplicateTargets,
        warnings: [],
      } as CompatibilityReport,
    };
  }

  const sample = await readSheetSampleByIntegration(
    companyId,
    integrationType,
    connector,
  );
  const compatibility = computeCompatibilityForConnector({
    connectorKey: connector.key,
    columns: sample.columns,
    mapping: connector.mapping,
  });

  return { sample, compatibility };
};

const resolveContainerForIntegration = (
  settingsDoc: any,
  integrationType: IntegrationType,
  ref?: {
    sourceId?: string;
    profileId?: string;
    sourceName?: string;
    profileName?: string;
  },
) => {
  const googleSheets = settingsDoc.googleSheets as any;
  if (integrationType === "oauth") {
    const sources = (googleSheets.oauth?.sources ?? []) as Array<Record<string, unknown>>;
    const requestedId = String(ref?.sourceId ?? "").trim();
    const activeId = String(googleSheets.oauth?.activeSourceId?.toString?.() ?? "").trim();

    let source =
      (requestedId ? sources.find((entry: any) => idEquals(entry._id, requestedId)) : null) ??
      (activeId ? sources.find((entry: any) => idEquals(entry._id, activeId)) : null) ??
      sources[0] ??
      null;

    if (!source) {
      const createdId = new Types.ObjectId();
      const draft = {
        _id: createdId,
        name: String(ref?.sourceName ?? "POS DATA SHEET").trim() || "POS DATA SHEET",
        connectors: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      googleSheets.oauth.sources.push(draft);
      source =
        (googleSheets.oauth.sources as Array<Record<string, unknown>>).find((entry) =>
          idEquals((entry as Record<string, unknown>)._id, createdId.toString()),
        ) ?? draft;
    }

    return {
      container: source,
      containerId:
        (source as Record<string, unknown>)._id?.toString?.() ??
        String((source as Record<string, unknown>)._id ?? ""),
    };
  }

  const profiles = (googleSheets.shared?.profiles ?? []) as Array<Record<string, unknown>>;
  const requestedId = String(ref?.profileId ?? "").trim();
  const activeId = String(googleSheets.shared?.activeProfileId?.toString?.() ?? "").trim();

  let profile =
    (requestedId ? profiles.find((entry: any) => idEquals(entry._id, requestedId)) : null) ??
    (activeId ? profiles.find((entry: any) => idEquals(entry._id, activeId)) : null) ??
    profiles[0] ??
    null;

  if (!profile) {
    const createdId = new Types.ObjectId();
    const draft = {
      _id: createdId,
      name: String(ref?.profileName ?? "POS DATA SHEET").trim() || "POS DATA SHEET",
      connectors: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    googleSheets.shared.profiles.push(draft);
    profile =
      (googleSheets.shared.profiles as Array<Record<string, unknown>>).find((entry) =>
        idEquals((entry as Record<string, unknown>)._id, createdId.toString()),
      ) ?? draft;
  }

  return {
    container: profile,
    containerId:
      (profile as Record<string, unknown>)._id?.toString?.() ??
      String((profile as Record<string, unknown>)._id ?? ""),
  };
};

const getExistingConnectorMapping = (params: {
  settingsDoc: any;
  integrationType: IntegrationType;
  connectorKey: string;
  sourceId?: string;
  profileId?: string;
}) => {
  const googleSheets = params.settingsDoc.googleSheets as any;
  const key = String(params.connectorKey ?? "").trim() || DEFAULT_CONNECTOR_KEY;

  if (params.integrationType === "oauth") {
    const sources = Array.isArray(googleSheets.oauth?.sources) ? googleSheets.oauth.sources : [];
    const requestedId = String(params.sourceId ?? "").trim();
    const activeId = String(googleSheets.oauth?.activeSourceId?.toString?.() ?? "").trim();
    const source =
      (requestedId ? sources.find((entry: any) => idEquals(entry._id, requestedId)) : null) ??
      (activeId ? sources.find((entry: any) => idEquals(entry._id, activeId)) : null) ??
      sources[0] ??
      null;
    const connector = Array.isArray(source?.connectors)
      ? source.connectors.find((entry: any) => String(entry?.key ?? "").trim() === key)
      : null;
    return {
      mapping: mapToPlain(connector?.mapping),
      transformations: normalizeTransformations(connector?.transformations),
    };
  }

  const profiles = Array.isArray(googleSheets.shared?.profiles) ? googleSheets.shared.profiles : [];
  const requestedId = String(params.profileId ?? "").trim();
  const activeId = String(googleSheets.shared?.activeProfileId?.toString?.() ?? "").trim();
  const profile =
    (requestedId ? profiles.find((entry: any) => idEquals(entry._id, requestedId)) : null) ??
    (activeId ? profiles.find((entry: any) => idEquals(entry._id, activeId)) : null) ??
    profiles[0] ??
    null;
  const connector = Array.isArray(profile?.connectors)
    ? profile.connectors.find((entry: any) => String(entry?.key ?? "").trim() === key)
    : null;
  return {
    mapping: mapToPlain(connector?.mapping),
    transformations: normalizeTransformations(connector?.transformations),
  };
};

const updateIntegrationDebug = (
  settingsDoc: any,
  integrationType: IntegrationType,
  refId: string,
  connectorKey: string,
  debug: DebugResult,
) => {
  const googleSheets = settingsDoc.googleSheets;
  if (integrationType === "oauth") {
    const source = (googleSheets.oauth?.sources ?? []).find((entry: any) =>
      idEquals(entry._id, refId),
    );
    if (source) {
      const connector = (source.connectors ?? []).find(
        (entry: any) => String(entry.key ?? "") === connectorKey,
      );
      if (connector) connector.lastDebugResult = debug;
      source.lastDebugResult = debug;
    }
    googleSheets.oauth.lastDebugResult = debug;
    return;
  }

  const profile = (googleSheets.shared?.profiles ?? []).find((entry: any) =>
    idEquals(entry._id, refId),
  );
  if (profile) {
    const connector = (profile.connectors ?? []).find(
      (entry: any) => String(entry.key ?? "") === connectorKey,
    );
    if (connector) connector.lastDebugResult = debug;
    profile.lastDebugResult = debug;
  }
  googleSheets.shared.lastDebugResult = debug;
};

const runDebug = async (
  companyId: string,
  integrationType: IntegrationType,
  resolved: ResolvedSheetsConfig,
): Promise<DebugResult> => {
  const now = new Date().toISOString();
  const connectorKey = resolved.connectorKey;

  try {
    let authScopes: string[] | undefined;
    let expiresInSec: number | undefined;

    if (integrationType === "oauth") {
      const oauthClient = await getOAuthClientForCompany(companyId);
      const scopeRaw = oauthClient.credentials.scope;
      if (typeof scopeRaw === "string" && scopeRaw.trim()) {
        authScopes = scopeRaw.split(/\s+/).filter(Boolean);
      }
      if (typeof oauthClient.credentials.expiry_date === "number") {
        expiresInSec = Math.floor(
          (oauthClient.credentials.expiry_date - Date.now()) / 1000,
        );
      }
    }

    const sample = await readSheetSampleByIntegration(
      companyId,
      integrationType,
      {
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName,
        headerRow: resolved.headerRow,
      },
    );

    const compatibility = computeCompatibilityForConnector({
      connectorKey,
      columns: sample.columns,
      mapping: resolved.mapping,
    });

    const mappingOk = compatibility.status !== "error";
    return {
      ok: mappingOk,
      integrationType,
      connectorKey,
      checkedAt: now,
      auth: {
        ok: true,
        details: "Auth context available",
        scopes: authScopes,
        expiresInSec,
      },
      sheet: {
        ok: true,
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName,
        details: "Sheet readable",
      },
      header: {
        ok: sample.columns.length > 0,
        headerRow: sample.headerRow,
        columns: sample.columns,
      },
      mapping: {
        ok: mappingOk,
        details: mappingOk ? "Mapping compatible" : "Mapping incompatible",
        missingTargets: compatibility.missingTargets,
        duplicateTargets: compatibility.duplicateTargets,
      },
      sample: {
        ok: true,
        rowCount: sample.rows.length,
        details: "Sample rows fetched",
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Debug failed";
    return {
      ok: false,
      integrationType,
      connectorKey,
      checkedAt: now,
      auth: {
        ok: integrationType === "shared",
        details:
          integrationType === "shared"
            ? "Service account auth context available"
            : message,
      },
      sheet: {
        ok: false,
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName,
        details: message,
      },
      header: {
        ok: false,
        headerRow: resolved.headerRow,
        columns: [],
      },
      mapping: {
        ok: false,
        details: message,
        missingTargets: [],
        duplicateTargets: [],
      },
      sample: {
        ok: false,
        details: message,
      },
    };
  }
};

const resolveForDebug = async (
  companyId: string,
  integrationType: IntegrationType,
  refId: string | undefined,
  connectorKey?: string,
) => {
  const key = String(connectorKey ?? "").trim();
  if (!refId) {
    return resolveActiveSheetsConfig(companyId, key || undefined);
  }

  return resolveSheetsConfigByRef(companyId, {
    integrationType,
    sourceId: integrationType === "oauth" ? refId : undefined,
    profileId: integrationType === "shared" ? refId : undefined,
    connectorKey: key || undefined,
  });
};

export const getGoogleSheetsSettingsView = async (
  companyId: string,
  userId: string,
) => {
  const settings = await getOrCreateSettings(companyId, userId);
  ensureGoogleSheetsShape(settings);
  const googleSheets = settings.googleSheets as any;

  return {
    id: settings._id.toString(),
    companyId: String(settings.companyId),
    ownerUserId: String(settings.ownerUserId),
    googleSheets: {
      activeIntegration: googleSheets.activeIntegration ?? null,
      oauth: {
        enabled: Boolean(googleSheets.oauth?.enabled),
        connectionStatus:
          googleSheets.oauth?.connectionStatus ?? "not_connected",
        activeSourceId: googleSheets.oauth?.activeSourceId?.toString?.() ?? null,
        activeConnectorKey:
          googleSheets.oauth?.activeConnectorKey ?? DEFAULT_CONNECTOR_KEY,
        sources: (googleSheets.oauth?.sources ?? []).map(toSourceResponse),
        lastDebugResult: googleSheets.oauth?.lastDebugResult ?? null,
        lastImportAt: googleSheets.oauth?.lastImportAt ?? null,
      },
      shared: {
        enabled: Boolean(googleSheets.shared?.enabled),
        activeProfileId:
          googleSheets.shared?.activeProfileId?.toString?.() ?? null,
        activeConnectorKey:
          googleSheets.shared?.activeConnectorKey ?? DEFAULT_CONNECTOR_KEY,
        profiles: (googleSheets.shared?.profiles ?? []).map(toProfileResponse),
        lastDebugResult: googleSheets.shared?.lastDebugResult ?? null,
        lastImportAt: googleSheets.shared?.lastImportAt ?? null,
        lastScheduledSyncAt: googleSheets.shared?.lastScheduledSyncAt ?? null,
      },
      updatedAt: googleSheets.updatedAt ?? null,
    },
    quickbooks: settings.quickbooks,
    lastImportSource: settings.lastImportSource ?? null,
    lastImportAt: settings.lastImportAt ?? null,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
};

export const activateGoogleSheets = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof activateSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);

  const googleSheets = settings.googleSheets as any;
  const integrationType = params.input.integrationType;
  const connectorKey =
    String(
      params.input.connectorKey ??
        (integrationType === "oauth"
          ? googleSheets.oauth?.activeConnectorKey
          : googleSheets.shared?.activeConnectorKey) ??
        DEFAULT_CONNECTOR_KEY,
    ).trim() || DEFAULT_CONNECTOR_KEY;

  const resolved = await resolveSheetsConfigByRef(params.companyId, {
    integrationType,
    sourceId: integrationType === "oauth" ? params.input.sourceId : undefined,
    profileId: integrationType === "shared" ? params.input.profileId : undefined,
    connectorKey,
  });

  const sample = await readSheetSampleByIntegration(
    params.companyId,
    integrationType,
    {
      spreadsheetId: resolved.spreadsheetId,
      sheetName: resolved.sheetName,
      headerRow: resolved.headerRow,
    },
  );

  const compatibility = computeCompatibilityForConnector({
    connectorKey: resolved.connectorKey,
    columns: sample.columns,
    mapping: resolved.mapping,
  });

  if (compatibility.status === "error") {
    throw new GoogleSheetsApplicationError(
      "Connector is not compatible",
      400,
      compatibility,
    );
  }

  googleSheets.activeIntegration = integrationType;

  if (integrationType === "oauth") {
    googleSheets.oauth.enabled = true;
    googleSheets.oauth.activeSourceId = asObjectId(resolved.ref.sourceId);
    googleSheets.oauth.activeConnectorKey = resolved.connectorKey;
  } else {
    googleSheets.shared.enabled = true;
    googleSheets.shared.activeProfileId = asObjectId(resolved.ref.profileId);
    googleSheets.shared.activeConnectorKey = resolved.connectorKey;
  }

  googleSheets.updatedAt = new Date();
  await settings.save();

  return {
    ok: true,
    activeIntegration: integrationType,
    activeSourceId:
      integrationType === "oauth"
        ? googleSheets.oauth.activeSourceId?.toString?.() ?? null
        : null,
    activeProfileId:
      integrationType === "shared"
        ? googleSheets.shared.activeProfileId?.toString?.() ?? null
        : null,
    activeConnectorKey: resolved.connectorKey,
    compatibility,
  };
};

export const createOAuthSource = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof createOAuthSourceSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);

  const perConnectorCompatibility: Array<{
    key: string;
    compatibility: CompatibilityReport;
  }> = [];
  const connectors: Array<Record<string, unknown>> = [];

  for (const rawConnector of params.input.connectors) {
    const connector = normalizeConnectorPayload(rawConnector);
    const { compatibility } = await validateConnectorCompatibility(
      params.companyId,
      "oauth",
      {
        key: connector.key,
        spreadsheetId: connector.spreadsheetId,
        sheetName: connector.sheetName,
        headerRow: connector.headerRow,
        mapping: connector.mapping,
      },
    );

    if (compatibility.status === "error") {
      throw new GoogleSheetsApplicationError(
        `Connector ${connector.key} is not compatible`,
        400,
        compatibility,
      );
    }

    connectors.push({
      ...createDefaultConnector(connector.key),
      ...connector,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    perConnectorCompatibility.push({ key: connector.key, compatibility });
  }

  const source = {
    _id: new Types.ObjectId(),
    name: params.input.name.trim(),
    connectors,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const googleSheets = settings.googleSheets as any;
  googleSheets.oauth.sources.push(source);
  googleSheets.oauth.enabled = true;
  if (!googleSheets.oauth.activeSourceId) {
    googleSheets.oauth.activeSourceId = source._id;
  }
  if (!googleSheets.oauth.activeConnectorKey) {
    googleSheets.oauth.activeConnectorKey = DEFAULT_CONNECTOR_KEY;
  }
  googleSheets.updatedAt = new Date();
  await settings.save();

  return {
    source: toSourceResponse(source),
    perConnectorCompatibility,
  };
};

const mergeConnectorPatch = (
  connectorKey: string,
  parsed: z.infer<typeof connectorPatchSchema>,
  existing: any,
) =>
  normalizeConnectorPayload({
    key: connectorKey,
    label: parsed.label ?? existing?.label,
    enabled: parsed.enabled ?? Boolean(existing?.enabled ?? true),
    spreadsheetId: parsed.spreadsheetId ?? String(existing?.spreadsheetId ?? ""),
    spreadsheetTitle:
      parsed.spreadsheetTitle ??
      (existing?.spreadsheetTitle ? String(existing.spreadsheetTitle) : undefined),
    sheetName: parsed.sheetName ?? String(existing?.sheetName ?? "Sheet1"),
    headerRow: parsed.headerRow ?? Number(existing?.headerRow ?? 1),
    mapping: parsed.mapping ?? mapToPlain(existing?.mapping),
    transformations:
      parsed.transformations ?? normalizeTransformations(existing?.transformations),
    mappingConfirmedAt:
      parsed.mappingConfirmedAt ??
      (existing?.mappingConfirmedAt
        ? new Date(existing.mappingConfirmedAt as Date).toISOString()
        : undefined),
    mappingHash:
      parsed.mappingHash ??
      (existing?.mappingHash ? String(existing.mappingHash) : undefined),
    schedule: parsed.schedule ?? existing?.schedule,
  });

export const updateOAuthConnector = async (params: {
  companyId: string;
  userId: string;
  sourceId: string;
  connectorKey: string;
  input: z.infer<typeof connectorPatchSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);
  const googleSheets = settings.googleSheets as any;

  const source = (googleSheets.oauth.sources ?? []).find((entry: any) =>
    idEquals(entry._id, params.sourceId),
  );
  if (!source) {
    throw new GoogleSheetsApplicationError("OAuth source not found", 404);
  }

  const existing = (source.connectors ?? []).find(
    (entry: any) => String(entry.key ?? "").trim() === params.connectorKey,
  );
  const merged = mergeConnectorPatch(params.connectorKey, params.input, existing);

  const { compatibility } = await validateConnectorCompatibility(
    params.companyId,
    "oauth",
    {
      key: merged.key,
      spreadsheetId: merged.spreadsheetId,
      sheetName: merged.sheetName,
      headerRow: merged.headerRow,
      mapping: merged.mapping,
    },
  );

  if (compatibility.status === "error") {
    throw new GoogleSheetsApplicationError(
      `Connector ${params.connectorKey} is not compatible`,
      400,
      compatibility,
    );
  }

  if (existing) {
    existing.label = merged.label;
    existing.enabled = merged.enabled;
    existing.spreadsheetId = merged.spreadsheetId;
    existing.spreadsheetTitle = merged.spreadsheetTitle ?? null;
    existing.sheetName = merged.sheetName;
    existing.headerRow = merged.headerRow;
    existing.mapping = merged.mapping;
    existing.transformations = merged.transformations;
    existing.mappingConfirmedAt = merged.mappingConfirmedAt ?? null;
    existing.mappingHash = merged.mappingHash ?? null;
    existing.updatedAt = new Date();
  } else {
    source.connectors.push({
      ...createDefaultConnector(params.connectorKey),
      ...merged,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  source.updatedAt = new Date();
  googleSheets.updatedAt = new Date();
  await settings.save();

  const connector = (source.connectors ?? []).find(
    (entry: any) => String(entry.key ?? "").trim() === params.connectorKey,
  );

  return {
    connector: connector ? toConnectorResponse(connector) : null,
    compatibility,
  };
};

export const listOAuthSources = async (companyId: string, userId: string) => {
  const settings = await getOrCreateSettings(companyId, userId);
  ensureGoogleSheetsShape(settings);
  const googleSheets = settings.googleSheets as any;

  return {
    sources: (googleSheets.oauth?.sources ?? []).map(toSourceResponse),
    activeSourceId: googleSheets.oauth?.activeSourceId?.toString?.() ?? null,
    activeConnectorKey:
      googleSheets.oauth?.activeConnectorKey ?? DEFAULT_CONNECTOR_KEY,
    enabled: Boolean(googleSheets.oauth?.enabled),
    connectionStatus: googleSheets.oauth?.connectionStatus ?? "not_connected",
  };
};

export const createSharedProfile = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof createSharedProfileSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);

  const perConnectorCompatibility: Array<{
    key: string;
    compatibility: CompatibilityReport;
  }> = [];
  const connectors: Array<Record<string, unknown>> = [];

  for (const rawConnector of params.input.connectors) {
    const connector = normalizeConnectorPayload(rawConnector);
    const { compatibility } = await validateConnectorCompatibility(
      params.companyId,
      "shared",
      {
        key: connector.key,
        spreadsheetId: connector.spreadsheetId,
        sheetName: connector.sheetName,
        headerRow: connector.headerRow,
        mapping: connector.mapping,
      },
    );

    if (compatibility.status === "error") {
      throw new GoogleSheetsApplicationError(
        `Connector ${connector.key} is not compatible`,
        400,
        compatibility,
      );
    }

    connectors.push({
      ...createDefaultConnector(connector.key),
      ...connector,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    perConnectorCompatibility.push({ key: connector.key, compatibility });
  }

  const profile = {
    _id: new Types.ObjectId(),
    name: params.input.name.trim(),
    connectors,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const googleSheets = settings.googleSheets as any;
  googleSheets.shared.profiles.push(profile);
  googleSheets.shared.enabled = true;
  if (!googleSheets.shared.activeProfileId) {
    googleSheets.shared.activeProfileId = profile._id;
  }
  if (!googleSheets.shared.activeConnectorKey) {
    googleSheets.shared.activeConnectorKey = DEFAULT_CONNECTOR_KEY;
  }
  googleSheets.updatedAt = new Date();
  await settings.save();

  return {
    profile: toProfileResponse(profile),
    perConnectorCompatibility,
  };
};

export const updateSharedConnector = async (params: {
  companyId: string;
  userId: string;
  profileId: string;
  connectorKey: string;
  input: z.infer<typeof connectorPatchSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);
  const googleSheets = settings.googleSheets as any;

  const profile = (googleSheets.shared.profiles ?? []).find((entry: any) =>
    idEquals(entry._id, params.profileId),
  );
  if (!profile) {
    throw new GoogleSheetsApplicationError("Shared profile not found", 404);
  }

  const existing = (profile.connectors ?? []).find(
    (entry: any) => String(entry.key ?? "").trim() === params.connectorKey,
  );
  const merged = mergeConnectorPatch(params.connectorKey, params.input, existing);

  const { compatibility } = await validateConnectorCompatibility(
    params.companyId,
    "shared",
    {
      key: merged.key,
      spreadsheetId: merged.spreadsheetId,
      sheetName: merged.sheetName,
      headerRow: merged.headerRow,
      mapping: merged.mapping,
    },
  );

  if (compatibility.status === "error") {
    throw new GoogleSheetsApplicationError(
      `Connector ${params.connectorKey} is not compatible`,
      400,
      compatibility,
    );
  }

  if (existing) {
    existing.label = merged.label;
    existing.enabled = merged.enabled;
    existing.spreadsheetId = merged.spreadsheetId;
    existing.spreadsheetTitle = merged.spreadsheetTitle ?? null;
    existing.sheetName = merged.sheetName;
    existing.headerRow = merged.headerRow;
    existing.mapping = merged.mapping;
    existing.transformations = merged.transformations;
    existing.mappingConfirmedAt = merged.mappingConfirmedAt ?? null;
    existing.mappingHash = merged.mappingHash ?? null;
    existing.schedule = merged.schedule;
    existing.updatedAt = new Date();
  } else {
    profile.connectors.push({
      ...createDefaultConnector(params.connectorKey),
      ...merged,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  profile.updatedAt = new Date();
  googleSheets.updatedAt = new Date();
  await settings.save();

  const connector = (profile.connectors ?? []).find(
    (entry: any) => String(entry.key ?? "").trim() === params.connectorKey,
  );

  return {
    connector: connector ? toConnectorResponse(connector) : null,
    compatibility,
  };
};

export const listSharedProfiles = async (companyId: string, userId: string) => {
  const settings = await getOrCreateSettings(companyId, userId);
  ensureGoogleSheetsShape(settings);
  const googleSheets = settings.googleSheets as any;

  return {
    profiles: (googleSheets.shared?.profiles ?? []).map(toProfileResponse),
    activeProfileId: googleSheets.shared?.activeProfileId?.toString?.() ?? null,
    activeConnectorKey:
      googleSheets.shared?.activeConnectorKey ?? DEFAULT_CONNECTOR_KEY,
    enabled: Boolean(googleSheets.shared?.enabled),
  };
};

export const stageGoogleSheetsChange = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof stageChangeSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);
  const integrationType: IntegrationType = params.input.sourceType;
  const connectorKey =
    String(params.input.connectorKey ?? DEFAULT_CONNECTOR_KEY).trim() ||
    DEFAULT_CONNECTOR_KEY;
  const rawSheetName = params.input.sheetName ?? params.input.tab;
  const resolvedSheetName = String(rawSheetName ?? "").trim();
  if (!resolvedSheetName) {
    throw new GoogleSheetsApplicationError("sheetName is required", 400);
  }
  const resolvedSpreadsheetId = String(params.input.spreadsheetId ?? "").trim();
  if (!resolvedSpreadsheetId) {
    throw new GoogleSheetsApplicationError("spreadsheetId is required", 400);
  }

  const existing = getExistingConnectorMapping({
    settingsDoc: settings,
    integrationType,
    connectorKey,
    sourceId: params.input.sourceId,
    profileId: params.input.profileId,
  });

  const mapping =
    params.input.mapping != null
      ? Object.fromEntries(
          Object.entries(params.input.mapping).map(([column, target]) => [
            String(column),
            String(target),
          ]),
        )
      : existing.mapping;

  const transformations =
    params.input.transformations != null
      ? normalizeTransformations(params.input.transformations)
      : existing.transformations;

  const sample = await readSheetSampleByIntegration(
    params.companyId,
    integrationType,
    {
      spreadsheetId: resolvedSpreadsheetId,
      sheetName: resolvedSheetName,
      headerRow: params.input.headerRow,
    },
  );

  const sampleRowsMatrix = sample.rows.map((row) =>
    sample.columns.map((column) => String(row[column] ?? "")),
  );
  const suggestions = suggestMappings(
    sample.columns,
    sampleRowsMatrix,
    POS_MAPPING_TARGET_FIELDS,
  ).map((entry, index) => ({
    col: String.fromCharCode(65 + index),
    header: entry.sourceHeader,
    suggestion: entry.targetField,
    score: entry.score,
  }));

  const oneToOne = validateColumnMapOneToOne(mapping);
  const compatibility = computeCompatibilityForConnector({
    connectorKey,
    columns: sample.columns,
    mapping,
  });

  if (!oneToOne.ok) {
    compatibility.status = "error";
    compatibility.duplicateTargets = oneToOne.duplicateTargets;
  }

  return {
    connectorKey,
    sourceType: integrationType,
    preview: {
      header: sample.columns,
      sampleRows: sampleRowsMatrix.slice(0, 10),
      suggestions,
      detectedHeaderRow: sample.headerRow,
    },
    compatibility,
    mapping,
    transformations,
    spreadsheetTitle: params.input.spreadsheetTitle
      ? String(params.input.spreadsheetTitle).trim()
      : null,
    sheetName: resolvedSheetName,
    spreadsheetId: resolvedSpreadsheetId,
  };
};

export const commitGoogleSheetsChange = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof commitChangeSchema>;
}) => {
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);
  const googleSheets = settings.googleSheets as any;
  const integrationType: IntegrationType = params.input.sourceType;
  const connectorKey =
    String(params.input.connectorKey ?? DEFAULT_CONNECTOR_KEY).trim() ||
    DEFAULT_CONNECTOR_KEY;
  const rawSheetName = params.input.sheetName ?? params.input.tab;
  const resolvedSheetName = String(rawSheetName ?? "").trim();
  if (!resolvedSheetName) {
    throw new GoogleSheetsApplicationError("sheetName is required", 400);
  }
  const resolvedSpreadsheetId = String(params.input.spreadsheetId ?? "").trim();
  if (!resolvedSpreadsheetId) {
    throw new GoogleSheetsApplicationError("spreadsheetId is required", 400);
  }

  const { container, containerId } = resolveContainerForIntegration(
    settings,
    integrationType,
    {
      sourceId: params.input.sourceId,
      profileId: params.input.profileId,
      sourceName: params.input.sourceName,
      profileName: params.input.profileName,
    },
  );

  const containerConnectors = Array.isArray(container.connectors)
    ? (container.connectors as Array<Record<string, unknown>>)
    : [];
  if (!Array.isArray(container.connectors)) {
    container.connectors = containerConnectors;
  }

  const mapping = Object.fromEntries(
    Object.entries(params.input.mapping ?? {}).map(([column, target]) => [
      String(column),
      String(target),
    ]),
  );
  const transformations = normalizeTransformations(params.input.transformations);

  const oneToOne = validateColumnMapOneToOne(mapping);
  if (!oneToOne.ok) {
    throw new GoogleSheetsApplicationError(
      `One-to-one mapping required. Duplicate target fields: ${oneToOne.duplicateTargets.join(", ")}`,
      400,
      { duplicateTargets: oneToOne.duplicateTargets },
    );
  }

  const sample = await readSheetSampleByIntegration(
    params.companyId,
    integrationType,
    {
      spreadsheetId: resolvedSpreadsheetId,
      sheetName: resolvedSheetName,
      headerRow: params.input.headerRow,
    },
  );
  const compatibility = computeCompatibilityForConnector({
    connectorKey,
    columns: sample.columns,
    mapping,
  });
  if (compatibility.status === "error") {
    throw new GoogleSheetsApplicationError(
      "Connector is not compatible",
      400,
      compatibility,
    );
  }

  const existingIndex = containerConnectors.findIndex(
    (entry) => String(entry.key ?? "").trim() === connectorKey,
  );

  const nextConnector = {
    ...createDefaultConnector(connectorKey),
    ...(existingIndex >= 0 ? containerConnectors[existingIndex] : {}),
    key: connectorKey,
    label: getConnectorDefinition(connectorKey).label,
    enabled: true,
    spreadsheetId: resolvedSpreadsheetId,
    spreadsheetTitle: params.input.spreadsheetTitle
      ? String(params.input.spreadsheetTitle).trim()
      : null,
    sheetName: resolvedSheetName,
    headerRow: params.input.headerRow,
    mapping,
    transformations,
    mappingConfirmedAt: params.input.mappingConfirmedAt
      ? new Date(params.input.mappingConfirmedAt)
      : null,
    mappingHash: params.input.mappingHash
      ? String(params.input.mappingHash).trim()
      : null,
    updatedAt: new Date(),
  };

  if (existingIndex >= 0) {
    containerConnectors[existingIndex] = nextConnector;
  } else {
    containerConnectors.push({
      ...nextConnector,
      createdAt: new Date(),
    });
  }

  container.connectors = containerConnectors;
  container.updatedAt = new Date();

  if (integrationType === "oauth") {
    googleSheets.oauth.enabled = true;
    if (params.input.activate) {
      googleSheets.activeIntegration = "oauth";
      googleSheets.oauth.activeSourceId = asObjectId(containerId);
      googleSheets.oauth.activeConnectorKey = connectorKey;
    }
  } else {
    googleSheets.shared.enabled = true;
    if (params.input.activate) {
      googleSheets.activeIntegration = "shared";
      googleSheets.shared.activeProfileId = asObjectId(containerId);
      googleSheets.shared.activeConnectorKey = connectorKey;
    }
  }

  googleSheets.updatedAt = new Date();
  await settings.save();

  const connector = (
    Array.isArray(container.connectors)
      ? (container.connectors as Array<Record<string, unknown>>)
      : []
  ).find(
    (entry: any) => String(entry.key ?? "").trim() === connectorKey,
  );

  return {
    ok: true,
    sourceType: integrationType,
    sourceId: integrationType === "oauth" ? containerId : null,
    profileId: integrationType === "shared" ? containerId : null,
    connectorKey,
    compatibility,
    connector: connector ? toConnectorResponse(connector) : null,
  };
};

export const debugOAuthConnector = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof debugOAuthSchema>;
}) => {
  const resolved = await resolveForDebug(
    params.companyId,
    "oauth",
    params.input.sourceId,
    params.input.connectorKey,
  );

  const debug = await runDebug(params.companyId, "oauth", resolved);
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);
  updateIntegrationDebug(
    settings,
    "oauth",
    String(resolved.ref.sourceId ?? ""),
    resolved.connectorKey,
    debug,
  );
  (settings.googleSheets as any).updatedAt = new Date();
  await settings.save();

  return debug;
};

export const debugSharedConnector = async (params: {
  companyId: string;
  userId: string;
  input: z.infer<typeof debugSharedSchema>;
}) => {
  const resolved = await resolveForDebug(
    params.companyId,
    "shared",
    params.input.profileId,
    params.input.connectorKey,
  );

  const debug = await runDebug(params.companyId, "shared", resolved);
  const settings = await getOrCreateSettings(params.companyId, params.userId);
  ensureGoogleSheetsShape(settings);
  updateIntegrationDebug(
    settings,
    "shared",
    String(resolved.ref.profileId ?? ""),
    resolved.connectorKey,
    debug,
  );
  (settings.googleSheets as any).updatedAt = new Date();
  await settings.save();

  return debug;
};

export const markConnectorImported = async (params: {
  companyId: string;
  integrationType: IntegrationType;
  sourceId?: string;
  profileId?: string;
  connectorKey: string;
  importedAt: Date;
}) => {
  const settings = await IntegrationSettingsModel.findOne({
    companyId: params.companyId,
  });
  if (!settings) return;

  ensureGoogleSheetsShape(settings as any);
  const googleSheets = (settings as any).googleSheets;

  if (params.integrationType === "oauth") {
    const source = (googleSheets.oauth.sources ?? []).find((entry: any) =>
      idEquals(entry._id, String(params.sourceId ?? "")),
    );
    if (source) {
      const connector = (source.connectors ?? []).find(
        (entry: any) => String(entry.key ?? "") === params.connectorKey,
      );
      if (connector) connector.lastImportAt = params.importedAt;
    }
    googleSheets.oauth.lastImportAt = params.importedAt;
  } else {
    const profile = (googleSheets.shared.profiles ?? []).find((entry: any) =>
      idEquals(entry._id, String(params.profileId ?? "")),
    );
    if (profile) {
      const connector = (profile.connectors ?? []).find(
        (entry: any) => String(entry.key ?? "") === params.connectorKey,
      );
      if (connector) connector.lastImportAt = params.importedAt;
    }
    googleSheets.shared.lastImportAt = params.importedAt;
  }

  settings.lastImportSource = "google_sheets";
  settings.lastImportAt = params.importedAt;
  googleSheets.updatedAt = params.importedAt;
  await settings.save();
};
