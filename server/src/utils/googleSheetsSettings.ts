import { Types } from "mongoose";
import { IntegrationSettingsModel } from "../models/IntegrationSettings";
import { cleanupGoogleSheetsConfig } from "./googleSheetsDbCleanup";
import {
  DEFAULT_CONNECTOR_KEY,
  getConnectorDefinition,
} from "./sheetsConnectors";

const nowIso = () => new Date().toISOString();

export const createDefaultConnector = (
  key = DEFAULT_CONNECTOR_KEY,
  overrides?: Partial<Record<string, unknown>>,
) => {
  const definition = getConnectorDefinition(key);
  return {
    key: definition.key,
    label: definition.label,
    enabled: true,
    spreadsheetId: "",
    spreadsheetTitle: null,
    sheetName: "Sheet1",
    headerRow: 1,
    mapping: {},
    transformations: {},
    mappingConfirmedAt: null,
    mappingHash: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...(overrides ?? {}),
  } as Record<string, unknown>;
};

export const createEmptyGoogleSheetsConfig = () => ({
  oauth: {
    enabled: false,
    connectionStatus: "not_connected" as const,
    sources: [] as Array<Record<string, unknown>>,
    activeSourceId: null as Types.ObjectId | null,
    activeConnectorKey: DEFAULT_CONNECTOR_KEY,
    lastDebugResult: undefined,
    lastImportAt: null as Date | null,
  },
  shared: {
    enabled: false,
    profiles: [] as Array<Record<string, unknown>>,
    activeProfileId: null as Types.ObjectId | null,
    activeConnectorKey: DEFAULT_CONNECTOR_KEY,
    lastDebugResult: undefined,
    lastScheduledSyncAt: null as Date | null,
    lastImportAt: null as Date | null,
  },
  activeIntegration: null as "oauth" | "shared" | null,
  updatedAt: new Date(),
});

export const ensureGoogleSheetsShape = (settingsDoc: any) => {
  let touched = false;
  if (!settingsDoc.googleSheets) {
    settingsDoc.googleSheets = createEmptyGoogleSheetsConfig();
    touched = true;
  }
  const { normalized, changed, issues } = cleanupGoogleSheetsConfig(
    settingsDoc.googleSheets,
  );

  const gs = settingsDoc.googleSheets as Record<string, any>;
  if (!gs.oauth) {
    gs.oauth = createEmptyGoogleSheetsConfig().oauth;
    touched = true;
    if (issues.length > 0) {
      const companyId = settingsDoc.companyId || "unknown";
      console.warn(
        `[googleSheets] config cleanup for company ${companyId} produced issues:`,
        issues,
      );
    }
    if (!gs.shared) {
      gs.shared = createEmptyGoogleSheetsConfig().shared;
      touched = true;
    }
    if (!("activeIntegration" in gs)) {
      gs.activeIntegration = null;
      touched = true;
    }

    if (!Array.isArray(gs.oauth.sources)) {
      gs.oauth.sources = [];
      touched = true;
      if (changed) {
        // `normalized` is a plain object, but settingsDoc.googleSheets is a Mongoose subdocument.
        // Assigning a plain object to a subdocument path should mark it as modified.
        settingsDoc.googleSheets = normalized;
      }
      if (!Array.isArray(gs.shared.profiles)) {
        gs.shared.profiles = [];
        touched = true;
      }

      if (!gs.oauth.activeConnectorKey) {
        gs.oauth.activeConnectorKey = DEFAULT_CONNECTOR_KEY;
        touched = true;
      }
      if (!gs.shared.activeConnectorKey) {
        gs.shared.activeConnectorKey = DEFAULT_CONNECTOR_KEY;
        touched = true;
      }

      const normalizeConnectorArray = (
        connectorsRaw: unknown,
        fallbackFactory: () => Record<string, unknown> | null,
      ) => {
        const connectors = Array.isArray(connectorsRaw)
          ? (connectorsRaw as Array<Record<string, unknown>>)
          : [];
        if (!Array.isArray(connectorsRaw)) touched = true;

        const normalized: Array<Record<string, unknown>> = [];
        for (const connector of connectors) {
          if (!connector || typeof connector !== "object") {
            touched = true;
            continue;
          }
          const next = connector as Record<string, unknown>;
          const key =
            String(next.key ?? DEFAULT_CONNECTOR_KEY).trim() ||
            DEFAULT_CONNECTOR_KEY;
          const definition = getConnectorDefinition(key);
          const spreadsheetId = String(next.spreadsheetId ?? "").trim();
          const sheetName = String(next.sheetName ?? "").trim();
          if (!spreadsheetId || !sheetName) {
            touched = true;
            continue;
          }

          const enabled = next.enabled == null ? true : Boolean(next.enabled);
          const headerRow = Math.max(1, Number(next.headerRow ?? 1) || 1);
          const label =
            String(next.label ?? definition.label).trim() || definition.label;
          const mapping = mapToPlain(next.mapping);
          const transformations = normalizeTransformations(
            next.transformations,
          );

          if (next.key !== key) {
            next.key = key;
            touched = true;
          }
          if (String(next.label ?? "") !== label) {
            next.label = label;
            touched = true;
          }
          if (String(next.spreadsheetId ?? "").trim() !== spreadsheetId) {
            next.spreadsheetId = spreadsheetId;
            touched = true;
          }
          if (String(next.sheetName ?? "").trim() !== sheetName) {
            next.sheetName = sheetName;
            touched = true;
          }
          if (Boolean(next.enabled) !== enabled) {
            next.enabled = enabled;
            touched = true;
          }
          if (Number(next.headerRow ?? 1) !== headerRow) {
            next.headerRow = headerRow;
            touched = true;
          }
          next.mapping = mapping;
          next.transformations = transformations;
          normalized.push(next);
        }

        if (normalized.length === 0) {
          const fallback = fallbackFactory();
          if (fallback) {
            normalized.push(fallback);
            touched = true;
          }
        }

        return normalized;
      };

      gs.oauth.sources = (
        gs.oauth.sources as Array<Record<string, unknown>>
      ).map((source) => {
        const nextSource = source as Record<string, unknown>;
        if (!nextSource._id) {
          const legacyId = String(
            nextSource.sourceId ?? nextSource.id ?? "",
          ).trim();
          nextSource._id = Types.ObjectId.isValid(legacyId)
            ? new Types.ObjectId(legacyId)
            : new Types.ObjectId();
          touched = true;
        }

        nextSource.connectors = normalizeConnectorArray(
          nextSource.connectors,
          () => {
            const legacySpreadsheetId = String(
              nextSource.spreadsheetId ?? "",
            ).trim();
            const legacyRange = String(nextSource.range ?? "").trim();
            const legacySheetName =
              legacyRange
                .split("!")[0]
                ?.replace(/^'/, "")
                .replace(/'$/, "")
                .trim() ||
              String(nextSource.sheetName ?? "").trim() ||
              "Sheet1";
            if (!legacySpreadsheetId) return null;
            return createDefaultConnector(DEFAULT_CONNECTOR_KEY, {
              label: getConnectorDefinition(DEFAULT_CONNECTOR_KEY).label,
              enabled: Boolean(nextSource.active ?? true),
              spreadsheetId: legacySpreadsheetId,
              sheetName: legacySheetName,
              headerRow: 1,
              mapping: mapToPlain(nextSource.mapping),
              transformations: normalizeTransformations(
                nextSource.transformations,
              ),
            });
          },
        );

        return nextSource;
      });

      gs.shared.profiles = (
        gs.shared.profiles as Array<Record<string, unknown>>
      ).map((profile) => {
        const nextProfile = profile as Record<string, unknown>;
        if (!nextProfile._id) {
          const legacyId = String(
            nextProfile.profileId ?? nextProfile.id ?? "",
          ).trim();
          nextProfile._id = Types.ObjectId.isValid(legacyId)
            ? new Types.ObjectId(legacyId)
            : new Types.ObjectId();
          touched = true;
        }

        nextProfile.connectors = normalizeConnectorArray(
          nextProfile.connectors,
          () => {
            const legacySpreadsheetId = String(
              nextProfile.spreadsheetId ?? "",
            ).trim();
            const legacySheetName =
              String(nextProfile.sheetName ?? "").trim() || "Sheet1";
            if (!legacySpreadsheetId) return null;
            const lastMapping = nextProfile.lastMapping as
              | Record<string, unknown>
              | undefined;
            return createDefaultConnector(DEFAULT_CONNECTOR_KEY, {
              label: getConnectorDefinition(DEFAULT_CONNECTOR_KEY).label,
              enabled: Boolean(nextProfile.enabled ?? true),
              spreadsheetId: legacySpreadsheetId,
              sheetName: legacySheetName,
              headerRow: Math.max(1, Number(nextProfile.headerRow ?? 1) || 1),
              mapping: mapToPlain(
                nextProfile.columnsMap ?? lastMapping?.columnsMap,
              ),
              transformations: normalizeTransformations(
                lastMapping?.transformations,
              ),
              lastImportAt: nextProfile.lastImportAt ?? null,
            });
          },
        );

        return nextProfile;
      });

      const oauthActiveId = String(
        gs.oauth.activeSourceId?.toString?.() ?? gs.oauth.activeSourceId ?? "",
      ).trim();
      if (oauthActiveId) {
        const exists = (
          gs.oauth.sources as Array<Record<string, unknown>>
        ).some(
          (source) =>
            String((source as Record<string, unknown>)._id ?? "").trim() ===
            oauthActiveId,
        );
        if (!exists) {
          gs.oauth.activeSourceId = null;
          touched = true;
        }
      }
      if (!gs.oauth.activeSourceId && gs.oauth.sources.length > 0) {
        gs.oauth.activeSourceId = (
          gs.oauth.sources[0] as Record<string, unknown>
        )._id;
        touched = true;
      }

      const sharedActiveId = String(
        gs.shared.activeProfileId?.toString?.() ??
          gs.shared.activeProfileId ??
          "",
      ).trim();
      if (sharedActiveId) {
        const exists = (
          gs.shared.profiles as Array<Record<string, unknown>>
        ).some(
          (profile) =>
            String((profile as Record<string, unknown>)._id ?? "").trim() ===
            sharedActiveId,
        );
        if (!exists) {
          gs.shared.activeProfileId = null;
          touched = true;
        }
      }
      if (!gs.shared.activeProfileId && gs.shared.profiles.length > 0) {
        gs.shared.activeProfileId = (
          gs.shared.profiles[0] as Record<string, unknown>
        )._id;
        touched = true;
      }

      const hasReadyConnector = (
        containers: Array<Record<string, unknown>>,
        activeId: unknown,
        activeConnectorKey: unknown,
      ) => {
        const activeIdStr = String(
          activeId?.toString?.() ?? activeId ?? "",
        ).trim();
        if (!activeIdStr) return false;
        const container = containers.find(
          (entry) =>
            String((entry as Record<string, unknown>)._id ?? "").trim() ===
            activeIdStr,
        );
        if (!container) return false;
        const key =
          String(activeConnectorKey ?? DEFAULT_CONNECTOR_KEY).trim() ||
          DEFAULT_CONNECTOR_KEY;
        const connector = Array.isArray(container.connectors)
          ? (container.connectors as Array<Record<string, unknown>>).find(
              (entry) => String(entry.key ?? "").trim() === key,
            )
          : null;
        if (!connector) return false;
        const spreadsheetId = String(connector.spreadsheetId ?? "").trim();
        const sheetName = String(connector.sheetName ?? "").trim();
        const mapping = mapToPlain(connector.mapping);
        return (
          Boolean(connector.enabled ?? true) &&
          Boolean(spreadsheetId) &&
          Boolean(sheetName) &&
          Object.keys(mapping).length > 0
        );
      };

      const oauthReady = hasReadyConnector(
        gs.oauth.sources,
        gs.oauth.activeSourceId,
        gs.oauth.activeConnectorKey,
      );
      const sharedReady = hasReadyConnector(
        gs.shared.profiles,
        gs.shared.activeProfileId,
        gs.shared.activeConnectorKey,
      );

      if (gs.activeIntegration === "oauth" && !oauthReady) {
        gs.activeIntegration = null;
        touched = true;
      }
      if (gs.activeIntegration === "shared" && !sharedReady) {
        gs.activeIntegration = null;
        touched = true;
      }

      if (touched) {
        gs.updatedAt = new Date();
      }
      return gs;
    }
  }
};

export const getOrCreateSettings = async (
  companyId: string,
  userId: string,
) => {
  const settings = await IntegrationSettingsModel.findOneAndUpdate(
    { companyId },
    {
      $setOnInsert: {
        ownerUserId: userId,
        googleSheets: createEmptyGoogleSheetsConfig(),
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
  ensureGoogleSheetsShape(settings);
  if (
    typeof settings.isModified === "function" &&
    settings.isModified("googleSheets")
  ) {
    await settings.save();
  }
  return settings;
};

export const getConnectorFromContainer = (
  container: { connectors?: Array<Record<string, unknown>> },
  connectorKey: string,
) => {
  const connectors = Array.isArray(container.connectors)
    ? container.connectors
    : [];
  const normalizedKey =
    String(connectorKey || DEFAULT_CONNECTOR_KEY).trim() ||
    DEFAULT_CONNECTOR_KEY;
  const existing = connectors.find(
    (connector) => String(connector.key ?? "").trim() === normalizedKey,
  );
  if (existing) return existing;
  const definition = getConnectorDefinition(normalizedKey);
  const created = createDefaultConnector(normalizedKey, {
    label: definition.label,
    spreadsheetId: "",
    sheetName: "Sheet1",
    mapping: {},
    transformations: {},
  });
  connectors.push(created);
  container.connectors = connectors;

  // Return the stored connector reference (important for Mongoose document arrays).
  const stored = (container.connectors ?? []).find(
    (connector) =>
      String((connector as Record<string, unknown>).key ?? "").trim() ===
      normalizedKey,
  );
  return (stored as Record<string, unknown>) ?? created;
};

export const mapToPlain = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [
        String(key),
        String(entry),
      ]),
    );
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        String(entry),
      ]),
    );
  }
  return {};
};

export const normalizeTransformations = (
  value: unknown,
): Record<string, unknown> => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [String(key), entry]),
    );
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>));
  }
  return {};
};
/**
 * Convert string/ObjectId/unknown into a Mongo ObjectId (or null).
 * Accepts either an ObjectId, a valid ObjectId string, or undefined/null.
 */
export const asObjectId = (value: unknown): Types.ObjectId | null => {
  if (!value) return null;
  if (value instanceof Types.ObjectId) return value;

  const str = String((value as any)?.toString?.() ?? value).trim();
  if (!str) return null;

  return Types.ObjectId.isValid(str) ? new Types.ObjectId(str) : null;
};

/**
 * Loose ObjectId equality helper (ObjectId vs string vs {_id} etc).
 */
export const idEquals = (a: unknown, b: unknown): boolean => {
  const aStr = String((a as any)?.toString?.() ?? a ?? "").trim();
  const bStr = String((b as any)?.toString?.() ?? b ?? "").trim();
  return Boolean(aStr) && Boolean(bStr) && aStr === bStr;
};
