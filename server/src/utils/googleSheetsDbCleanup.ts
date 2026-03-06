// server/src/utils/googleSheetsDbCleanup.ts

import { Types } from "mongoose";
import {
  DEFAULT_CONNECTOR_KEY,
  getConnectorDefinition,
} from "./sheetsConnectors";

type SourceKey = "oauth" | "shared";

type CleanupIssue = string;

type CleanupResult = {
  normalized: Record<string, unknown>;
  changed: boolean;
  issues: CleanupIssue[];
};

type NormalizedConnector = {
  _id: Types.ObjectId;
  key: string;
  label: string;
  enabled: boolean;
  spreadsheetId: string;
  sheetName: string;
  headerRow: number;
  mapping: Record<string, string>;
  transformations: Record<string, unknown>;
  schedule?: {
    enabled: boolean;
    frequency: "hourly" | "daily" | "weekly" | "manual";
    timeOfDay?: string;
    dayOfWeek?: number;
  };
  lastDebugResult?: unknown;
  lastImportAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type NormalizedContainer = {
  _id: Types.ObjectId;
  name: string;
  connectors: NormalizedConnector[];
  lastDebugResult?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const now = () => new Date();

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const asTrimmedString = (value: unknown) => String(value ?? "").trim();

const parseMaybeDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parseObjectId = (value: unknown): Types.ObjectId | null => {
  const raw = asTrimmedString(value);
  if (!raw || !Types.ObjectId.isValid(raw)) return null;
  return new Types.ObjectId(raw);
};

const toStringMap = (value: unknown): Record<string, string> => {
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [
        String(key),
        String(entry ?? ""),
      ]),
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        String(entry ?? ""),
      ]),
    );
  }
  return {};
};

const toObjectMap = (value: unknown): Record<string, unknown> => {
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [String(key), entry]),
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>));
  }
  return {};
};

const parseRangeSheetName = (range: string) => {
  if (!range) return "Sheet1";
  const tab = range.split("!")[0]?.trim();
  if (!tab) return "Sheet1";
  return tab.replace(/^'/, "").replace(/'$/, "") || "Sheet1";
};

const dedupeMappingByTarget = (
  mapping: Record<string, string>,
  issues: CleanupIssue[],
  path: string,
) => {
  const usedTargets = new Set<string>();
  const next: Record<string, string> = {};

  for (const [column, rawTarget] of Object.entries(mapping)) {
    const target = asTrimmedString(rawTarget);
    if (!target) continue;
    const normalizedTarget = target.toLowerCase();
    if (usedTargets.has(normalizedTarget)) {
      issues.push(
        `${path}: duplicate target "${target}" removed from column "${column}"`,
      );
      continue;
    }
    usedTargets.add(normalizedTarget);
    next[column] = target;
  }

  return next;
};

const isConnectorReady = (
  connector: Pick<
    NormalizedConnector,
    "enabled" | "spreadsheetId" | "sheetName" | "mapping"
  >,
) =>
  connector.enabled &&
  Boolean(asTrimmedString(connector.spreadsheetId)) &&
  Boolean(asTrimmedString(connector.sheetName)) &&
  Object.keys(connector.mapping ?? {}).length > 0;

const normalizeConnector = (
  raw: unknown,
  issues: CleanupIssue[],
  path: string,
): NormalizedConnector => {
  const record = asRecord(raw);
  const key = asTrimmedString(record.key) || DEFAULT_CONNECTOR_KEY;
  const definition = getConnectorDefinition(key);
  const rawMapping = toStringMap(record.mapping);

  return {
    _id: parseObjectId(record._id) ?? new Types.ObjectId(),
    key,
    label: asTrimmedString(record.label) || definition.label,
    enabled: Boolean(record.enabled ?? true),
    spreadsheetId: asTrimmedString(record.spreadsheetId),
    sheetName: asTrimmedString(record.sheetName) || "Sheet1",
    headerRow: Math.max(1, Number(record.headerRow ?? 1) || 1),
    mapping: dedupeMappingByTarget(rawMapping, issues, path),
    transformations: toObjectMap(record.transformations),
    schedule:
      record.schedule && typeof record.schedule === "object"
        ? {
            enabled: Boolean(asRecord(record.schedule).enabled ?? false),
            frequency: (
              ["hourly", "daily", "weekly", "manual"] as const
            ).includes(
              asTrimmedString(asRecord(record.schedule).frequency) as "hourly",
            )
              ? (asTrimmedString(asRecord(record.schedule).frequency) as
                  | "hourly"
                  | "daily"
                  | "weekly"
                  | "manual")
              : "manual",
            timeOfDay:
              asTrimmedString(asRecord(record.schedule).timeOfDay) || undefined,
            dayOfWeek: Number.isFinite(
              Number(asRecord(record.schedule).dayOfWeek),
            )
              ? Math.max(
                  0,
                  Math.min(6, Number(asRecord(record.schedule).dayOfWeek)),
                )
              : undefined,
          }
        : undefined,
    lastDebugResult: record.lastDebugResult,
    lastImportAt: parseMaybeDate(record.lastImportAt),
    createdAt: parseMaybeDate(record.createdAt) ?? now(),
    updatedAt: parseMaybeDate(record.updatedAt) ?? now(),
  };
};

const dedupeConnectorsByKey = (
  connectors: NormalizedConnector[],
  issues: CleanupIssue[],
  path: string,
) => {
  const byKey = new Map<string, NormalizedConnector>();

  for (const connector of connectors) {
    const existing = byKey.get(connector.key);
    if (!existing) {
      byKey.set(connector.key, connector);
      continue;
    }

    const score = (candidate: NormalizedConnector) =>
      (candidate.spreadsheetId ? 100 : 0) +
      (candidate.enabled ? 10 : 0) +
      Object.keys(candidate.mapping ?? {}).length;

    const winner = score(connector) >= score(existing) ? connector : existing;
    byKey.set(connector.key, winner);
    issues.push(
      `${path}: duplicate connector key "${connector.key}" deduplicated`,
    );
  }

  const next = Array.from(byKey.values());
  if (next.length === 0) {
    next.push(
      normalizeConnector(
        {
          key: DEFAULT_CONNECTOR_KEY,
          label: getConnectorDefinition(DEFAULT_CONNECTOR_KEY).label,
          enabled: false,
        },
        issues,
        `${path}[default]`,
      ),
    );
  }
  return next;
};

const normalizeContainer = (
  raw: unknown,
  issues: CleanupIssue[],
  path: string,
  fallbackName: string,
): NormalizedContainer => {
  const record = asRecord(raw);
  const connectorsRaw = asArray(record.connectors);
  const connectors = dedupeConnectorsByKey(
    connectorsRaw.map((entry, index) =>
      normalizeConnector(entry, issues, `${path}.connectors[${index}]`),
    ),
    issues,
    `${path}.connectors`,
  );

  return {
    _id: parseObjectId(record._id) ?? new Types.ObjectId(),
    name: asTrimmedString(record.name) || fallbackName,
    connectors,
    lastDebugResult: record.lastDebugResult,
    createdAt: parseMaybeDate(record.createdAt) ?? now(),
    updatedAt: parseMaybeDate(record.updatedAt) ?? now(),
  };
};

const fromLegacyShape = (googleSheetsRaw: Record<string, unknown>) => {
  const sources = asArray(googleSheetsRaw.sources).map((entry, index) => {
    const source = asRecord(entry);
    const sourceName =
      asTrimmedString(source.name) || `OAuth Source ${index + 1}`;
    return {
      _id: parseObjectId(source.sourceId ?? source._id) ?? new Types.ObjectId(),
      name: sourceName,
      connectors: [
        {
          _id: new Types.ObjectId(),
          key: DEFAULT_CONNECTOR_KEY,
          label: getConnectorDefinition(DEFAULT_CONNECTOR_KEY).label,
          enabled: Boolean(source.active ?? true),
          spreadsheetId: asTrimmedString(source.spreadsheetId),
          sheetName: parseRangeSheetName(asTrimmedString(source.range)),
          headerRow: 1,
          mapping: toStringMap(source.mapping),
          transformations: toObjectMap(source.transformations),
          lastImportAt: null,
          createdAt: now(),
          updatedAt: now(),
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    };
  });

  const sharedSheets = asArray(googleSheetsRaw.sharedSheets);
  const sharedFromConfig = asRecord(googleSheetsRaw.sharedConfig);
  const profilesSource =
    sharedSheets.length > 0
      ? sharedSheets
      : sharedFromConfig.spreadsheetId
        ? [sharedFromConfig]
        : [];
  const profiles = profilesSource.map((entry, index) => {
    const profile = asRecord(entry);
    const profileName =
      asTrimmedString(profile.name) || `Shared Profile ${index + 1}`;
    return {
      _id:
        parseObjectId(profile.profileId ?? profile._id) ?? new Types.ObjectId(),
      name: profileName,
      connectors: [
        {
          _id: new Types.ObjectId(),
          key: DEFAULT_CONNECTOR_KEY,
          label: getConnectorDefinition(DEFAULT_CONNECTOR_KEY).label,
          enabled: Boolean(profile.enabled ?? true),
          spreadsheetId: asTrimmedString(profile.spreadsheetId),
          sheetName: asTrimmedString(profile.sheetName) || "Sheet1",
          headerRow: Math.max(1, Number(profile.headerRow ?? 1) || 1),
          mapping: toStringMap(
            profile.columnsMap ?? asRecord(profile.lastMapping).columnsMap,
          ),
          transformations: toObjectMap(
            asRecord(profile.lastMapping).transformations,
          ),
          lastImportAt: parseMaybeDate(profile.lastImportAt),
          createdAt: now(),
          updatedAt: now(),
        },
      ],
      createdAt: now(),
      updatedAt: now(),
    };
  });

  const legacyMode = asTrimmedString(googleSheetsRaw.mode);
  const activeIntegration =
    legacyMode === "oauth"
      ? "oauth"
      : legacyMode === "service_account"
        ? "shared"
        : null;

  return {
    oauth: {
      enabled: Boolean(googleSheetsRaw.connected) || sources.length > 0,
      connectionStatus: Boolean(googleSheetsRaw.connected)
        ? "connected"
        : "not_connected",
      sources,
      activeSourceId:
        sources.find((entry) => entry.connectors[0].enabled)?._id ??
        sources[0]?._id ??
        null,
      activeConnectorKey: DEFAULT_CONNECTOR_KEY,
      lastDebugResult: undefined,
      lastImportAt: null,
    },
    shared: {
      enabled: profiles.length > 0,
      profiles,
      activeProfileId: profiles[0]?._id ?? null,
      activeConnectorKey: DEFAULT_CONNECTOR_KEY,
      lastDebugResult: undefined,
      lastScheduledSyncAt: parseMaybeDate(googleSheetsRaw.lastScheduledSyncAt),
      lastImportAt: parseMaybeDate(sharedFromConfig.lastImportAt),
    },
    activeIntegration,
    updatedAt: now(),
  };
};

/**
 * IMPORTANT:
 * This function is used ONLY for "before vs after" comparison by JSON.stringify.
 * It MUST be safe for:
 * - Mongoose documents/subdocs (cycles via parent pointers)
 * - Mongoose arrays (overridden .map)
 * - Maps, Dates, ObjectIds
 * - Circular references
 */
const normalizeForCompare = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
  depth = 0,
): unknown => {
  // Prevent pathological recursion even without explicit cycles
  if (depth > 50) return "[MaxDepth]";

  if (value == null) return null;

  // primitives
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;

  // safer Date detection than `instanceof Date` (avoids Symbol.hasInstance edge traps)
  if (Object.prototype.toString.call(value) === "[object Date]") {
    const d = value as Date;
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // ObjectId
  if (value instanceof Types.ObjectId) return value.toString();

  // Flatten mongoose docs/subdocs ASAP to avoid internal cycles
  if (
    value &&
    typeof value === "object" &&
    typeof (value as any).toObject === "function"
  ) {
    const plain = (value as any).toObject({
      depopulate: true,
      getters: false,
      virtuals: false,
      minimize: true,
      versionKey: false,
    });
    return normalizeForCompare(plain, seen, depth + 1);
  }

  // circular guard
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
  }

  // arrays — force native map to avoid MongooseArray.map override
  if (Array.isArray(value)) {
    return Array.prototype.map.call(value, (entry: unknown) =>
      normalizeForCompare(entry, seen, depth + 1),
    );
  }

  // maps
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [
        String(key),
        normalizeForCompare(entry, seen, depth + 1),
      ]),
    );
  }

  // objects
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [
          key,
          normalizeForCompare(entry, seen, depth + 1),
        ]),
    );
  }

  return value;
};

export const cleanupGoogleSheetsConfig = (
  googleSheetsRaw: unknown,
): CleanupResult => {
  const issues: CleanupIssue[] = [];
  const gsRecord = asRecord(googleSheetsRaw);

  const hasNewShape =
    Object.prototype.hasOwnProperty.call(gsRecord, "oauth") ||
    Object.prototype.hasOwnProperty.call(gsRecord, "shared");
  const base = hasNewShape ? gsRecord : fromLegacyShape(gsRecord);
  if (!hasNewShape) {
    issues.push("Legacy googleSheets shape converted to connector model");
  }

  const oauthRaw = asRecord(base.oauth);
  const sharedRaw = asRecord(base.shared);

  const oauthSources = asArray(oauthRaw.sources).map((entry, index) =>
    normalizeContainer(
      entry,
      issues,
      `oauth.sources[${index}]`,
      `OAuth Source ${index + 1}`,
    ),
  );
  const sharedProfiles = asArray(sharedRaw.profiles).map((entry, index) =>
    normalizeContainer(
      entry,
      issues,
      `shared.profiles[${index}]`,
      `Shared Profile ${index + 1}`,
    ),
  );

  let activeSourceId = parseObjectId(oauthRaw.activeSourceId);
  if (
    activeSourceId &&
    !oauthSources.some(
      (entry) => entry._id.toString() === activeSourceId?.toString(),
    )
  ) {
    issues.push(
      "oauth.activeSourceId did not match any source and was cleared",
    );
    activeSourceId = null;
  }

  let activeProfileId = parseObjectId(sharedRaw.activeProfileId);
  if (
    activeProfileId &&
    !sharedProfiles.some(
      (entry) => entry._id.toString() === activeProfileId?.toString(),
    )
  ) {
    issues.push(
      "shared.activeProfileId did not match any profile and was cleared",
    );
    activeProfileId = null;
  }

  const oauthActiveConnectorKey =
    asTrimmedString(oauthRaw.activeConnectorKey) || DEFAULT_CONNECTOR_KEY;
  const sharedActiveConnectorKey =
    asTrimmedString(sharedRaw.activeConnectorKey) || DEFAULT_CONNECTOR_KEY;

  const activeOauthContainer =
    oauthSources.find(
      (entry) => entry._id.toString() === activeSourceId?.toString(),
    ) ?? null;
  const activeSharedContainer =
    sharedProfiles.find(
      (entry) => entry._id.toString() === activeProfileId?.toString(),
    ) ?? null;

  const activeOauthConnector =
    activeOauthContainer?.connectors.find(
      (entry) => entry.key === oauthActiveConnectorKey,
    ) ?? null;
  const activeSharedConnector =
    activeSharedContainer?.connectors.find(
      (entry) => entry.key === sharedActiveConnectorKey,
    ) ?? null;

  const oauthReady = activeOauthConnector
    ? isConnectorReady(activeOauthConnector)
    : false;
  const sharedReady = activeSharedConnector
    ? isConnectorReady(activeSharedConnector)
    : false;

  let activeIntegrationRaw = asTrimmedString(base.activeIntegration);
  if (activeIntegrationRaw !== "oauth" && activeIntegrationRaw !== "shared") {
    activeIntegrationRaw = "";
  }

  let activeIntegration: "oauth" | "shared" | null = null;
  if (activeIntegrationRaw === "oauth" && oauthReady)
    activeIntegration = "oauth";
  if (activeIntegrationRaw === "shared" && sharedReady)
    activeIntegration = "shared";

  if (activeIntegrationRaw && !activeIntegration) {
    issues.push(
      `activeIntegration "${activeIntegrationRaw}" was not ready and was cleared`,
    );
  }

  if (!activeIntegration) {
    if (oauthReady && !sharedReady) {
      activeIntegration = "oauth";
      issues.push("activeIntegration auto-set to oauth (only ready source)");
    } else if (sharedReady && !oauthReady) {
      activeIntegration = "shared";
      issues.push("activeIntegration auto-set to shared (only ready source)");
    }
  }

  const normalized = {
    oauth: {
      enabled: Boolean(oauthRaw.enabled ?? false) || oauthSources.length > 0,
      connectionStatus:
        asTrimmedString(oauthRaw.connectionStatus) === "connected" ||
        asTrimmedString(oauthRaw.connectionStatus) === "error" ||
        asTrimmedString(oauthRaw.connectionStatus) === "not_connected"
          ? (asTrimmedString(oauthRaw.connectionStatus) as
              | "connected"
              | "error"
              | "not_connected")
          : "not_connected",
      sources: oauthSources,
      activeSourceId,
      activeConnectorKey: oauthActiveConnectorKey,
      lastDebugResult: oauthRaw.lastDebugResult,
      lastImportAt: parseMaybeDate(oauthRaw.lastImportAt),
    },
    shared: {
      enabled: Boolean(sharedRaw.enabled ?? false) || sharedProfiles.length > 0,
      profiles: sharedProfiles,
      activeProfileId,
      activeConnectorKey: sharedActiveConnectorKey,
      lastDebugResult: sharedRaw.lastDebugResult,
      lastScheduledSyncAt: parseMaybeDate(sharedRaw.lastScheduledSyncAt),
      lastImportAt: parseMaybeDate(sharedRaw.lastImportAt),
    },
    activeIntegration,
    updatedAt: now(),
  };

  // IMPORTANT: avoid passing live mongoose docs if possible.
  // This normalizeForCompare is safe even if you do, but this keeps output stable.
  const before = JSON.stringify(normalizeForCompare(googleSheetsRaw));
  const after = JSON.stringify(normalizeForCompare(normalized));

  return {
    normalized: normalized as Record<string, unknown>,
    changed: before !== after,
    issues,
  };
};
