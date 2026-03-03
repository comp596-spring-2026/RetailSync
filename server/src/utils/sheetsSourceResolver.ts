import { Types } from 'mongoose';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { DEFAULT_CONNECTOR_KEY } from './sheetsConnectors';

export class SheetsConfigError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(
      Array.from(value.entries()).map(([key, entry]) => [String(key), String(entry)])
    );
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, String(entry)])
    );
  }
  return {};
};

const normalizeUnknownRecord = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([key, entry]) => [String(key), entry]));
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>));
  }
  return {};
};

const toObjectIdString = (value: unknown) => {
  if (!value) return '';
  if (value instanceof Types.ObjectId) return value.toString();
  return String(value).trim();
};

const findConnector = (connectors: unknown[], connectorKey: string) =>
  connectors.find((entry) => String(asRecord(entry).key ?? '').trim() === connectorKey) ?? null;

const ensureConnectorConfig = (connector: unknown, connectorKey: string) => {
  const connectorRecord = asRecord(connector);
  if (!connectorRecord || Object.keys(connectorRecord).length === 0) {
    throw new SheetsConfigError(`Connector not configured: ${connectorKey}`, 400);
  }

  if (connectorRecord.enabled !== true) {
    throw new SheetsConfigError(`Connector is disabled: ${connectorKey}`, 400);
  }

  const spreadsheetId = String(connectorRecord.spreadsheetId ?? '').trim();
  const sheetName = String(connectorRecord.sheetName ?? '').trim();
  const mapping = normalizeStringRecord(connectorRecord.mapping);

  if (!spreadsheetId || !sheetName) {
    throw new SheetsConfigError(`Connector not configured: ${connectorKey}`, 400);
  }

  return {
    spreadsheetId,
    sheetName,
    headerRow: Math.max(1, Number(connectorRecord.headerRow ?? 1)),
    mapping,
    transformations: normalizeUnknownRecord(connectorRecord.transformations)
  };
};

export type ResolvedSheetsConfig = {
  integrationType: 'oauth' | 'shared';
  connectorKey: string;
  spreadsheetId: string;
  sheetName: string;
  headerRow: number;
  mapping: Record<string, string>;
  transformations: Record<string, unknown>;
  ref: {
    sourceId?: string;
    sourceName?: string;
    profileId?: string;
    profileName?: string;
    connectorKey: string;
    reason: 'active' | 'explicit_ref';
  };
};

type ResolveByRefParams = {
  integrationType: 'oauth' | 'shared';
  sourceId?: string;
  profileId?: string;
  connectorKey?: string;
};

const resolveFromDocByRef = (
  settingsDoc: any,
  params: ResolveByRefParams,
  reason: 'active' | 'explicit_ref'
): ResolvedSheetsConfig => {
  const googleSheets = asRecord(settingsDoc?.googleSheets);
  const connectorKey = String(params.connectorKey ?? '').trim() || DEFAULT_CONNECTOR_KEY;

  if (params.integrationType === 'oauth') {
    const oauth = asRecord(googleSheets.oauth);
    const sources = Array.isArray(oauth.sources) ? oauth.sources : [];

    const resolvedSourceId = String(params.sourceId ?? '').trim() || toObjectIdString(oauth.activeSourceId);
    if (!resolvedSourceId) {
      throw new SheetsConfigError('No active OAuth source configured', 400);
    }

    const source =
      sources.find((entry) => toObjectIdString(asRecord(entry)._id) === resolvedSourceId) ?? null;
    if (!source) {
      throw new SheetsConfigError('OAuth source not found', 400);
    }

    const sourceRecord = asRecord(source);
    const connectors = Array.isArray(sourceRecord.connectors) ? sourceRecord.connectors : [];
    const connector = findConnector(connectors, connectorKey);
    const normalized = ensureConnectorConfig(connector, connectorKey);

    return {
      integrationType: 'oauth',
      connectorKey,
      spreadsheetId: normalized.spreadsheetId,
      sheetName: normalized.sheetName,
      headerRow: normalized.headerRow,
      mapping: normalized.mapping,
      transformations: normalized.transformations,
      ref: {
        sourceId: resolvedSourceId,
        sourceName: String(sourceRecord.name ?? 'OAuth Source'),
        connectorKey,
        reason
      }
    };
  }

  const shared = asRecord(googleSheets.shared);
  const profiles = Array.isArray(shared.profiles) ? shared.profiles : [];
  const resolvedProfileId = String(params.profileId ?? '').trim() || toObjectIdString(shared.activeProfileId);
  if (!resolvedProfileId) {
    throw new SheetsConfigError('No active Shared profile configured', 400);
  }

  const profile =
    profiles.find((entry) => toObjectIdString(asRecord(entry)._id) === resolvedProfileId) ?? null;
  if (!profile) {
    throw new SheetsConfigError('Shared profile not found', 400);
  }

  const profileRecord = asRecord(profile);
  const connectors = Array.isArray(profileRecord.connectors) ? profileRecord.connectors : [];
  const connector = findConnector(connectors, connectorKey);
  const normalized = ensureConnectorConfig(connector, connectorKey);

  return {
    integrationType: 'shared',
    connectorKey,
    spreadsheetId: normalized.spreadsheetId,
    sheetName: normalized.sheetName,
    headerRow: normalized.headerRow,
    mapping: normalized.mapping,
    transformations: normalized.transformations,
    ref: {
      profileId: resolvedProfileId,
      profileName: String(profileRecord.name ?? 'Shared Profile'),
      connectorKey,
      reason
    }
  };
};

export const resolveActiveSheetsConfig = async (
  companyId: string,
  connectorKey?: string
): Promise<ResolvedSheetsConfig> => {
  const settingsDoc = await IntegrationSettingsModel.findOne({ companyId }).lean();
  if (!settingsDoc) {
    throw new SheetsConfigError('Google Sheets settings not found', 400);
  }

  const googleSheets = asRecord(settingsDoc.googleSheets);
  const activeIntegration = String(googleSheets.activeIntegration ?? '').trim();
  if (activeIntegration !== 'oauth' && activeIntegration !== 'shared') {
    throw new SheetsConfigError('No active Google Sheets integration configured', 400);
  }

  if (activeIntegration === 'oauth') {
    const oauth = asRecord(googleSheets.oauth);
    if (oauth.enabled !== true) {
      throw new SheetsConfigError('OAuth integration is disabled', 400);
    }
    const effectiveConnectorKey =
      String(connectorKey ?? '').trim() ||
      String(oauth.activeConnectorKey ?? '').trim() ||
      DEFAULT_CONNECTOR_KEY;

    return resolveFromDocByRef(
      settingsDoc,
      {
        integrationType: 'oauth',
        sourceId: toObjectIdString(oauth.activeSourceId),
        connectorKey: effectiveConnectorKey
      },
      'active'
    );
  }

  const shared = asRecord(googleSheets.shared);
  if (shared.enabled !== true) {
    throw new SheetsConfigError('Shared integration is disabled', 400);
  }

  const effectiveConnectorKey =
    String(connectorKey ?? '').trim() ||
    String(shared.activeConnectorKey ?? '').trim() ||
    DEFAULT_CONNECTOR_KEY;

  return resolveFromDocByRef(
    settingsDoc,
    {
      integrationType: 'shared',
      profileId: toObjectIdString(shared.activeProfileId),
      connectorKey: effectiveConnectorKey
    },
    'active'
  );
};

export const resolveSheetsConfigByRef = async (
  companyId: string,
  params: ResolveByRefParams
): Promise<ResolvedSheetsConfig> => {
  const settingsDoc = await IntegrationSettingsModel.findOne({ companyId }).lean();
  if (!settingsDoc) {
    throw new SheetsConfigError('Google Sheets settings not found', 400);
  }

  const connectorKey = String(params.connectorKey ?? '').trim() || DEFAULT_CONNECTOR_KEY;

  return resolveFromDocByRef(
    settingsDoc,
    {
      integrationType: params.integrationType,
      sourceId: params.sourceId,
      profileId: params.profileId,
      connectorKey
    },
    'explicit_ref'
  );
};
