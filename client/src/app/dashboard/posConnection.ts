import type { IntegrationSettings } from '../../modules/settings/state/settingsSlice';
import type { GoogleSheetsCanonicalSettings } from '../../modules/settings/types/googleSheets';

const isUsableConnector = (connector: Record<string, unknown> | null) => {
  if (!connector) return false;
  const spreadsheetId = String(connector.spreadsheetId ?? '').trim();
  const mapping = connector.mapping as Record<string, unknown> | undefined;
  return spreadsheetId.length > 0 && Object.keys(mapping ?? {}).length > 0;
};

const findConnector = (connectors: unknown[], preferredKey: string) => {
  const list = Array.isArray(connectors) ? connectors : [];
  const byPreferred = list.find(
    (entry) => String((entry as Record<string, unknown>)?.key ?? '').trim() === preferredKey
  );
  if (byPreferred) return byPreferred as Record<string, unknown>;
  const byDefault = list.find(
    (entry) => String((entry as Record<string, unknown>)?.key ?? '').trim() === 'pos_daily'
  );
  return (byDefault ?? null) as Record<string, unknown> | null;
};

export const hasCanonicalConnectorConfig = (googleSheets: unknown): boolean => {
  if (!googleSheets || typeof googleSheets !== 'object') return false;
  const gs = googleSheets as Record<string, unknown>;
  const activeIntegration = gs.activeIntegration;
  const oauth = (gs.oauth ?? {}) as Record<string, unknown>;
  const shared = (gs.shared ?? {}) as Record<string, unknown>;
  const oauthSources = Array.isArray(oauth.sources) ? oauth.sources : [];
  const sharedProfiles = Array.isArray(shared.profiles) ? shared.profiles : [];

  const hasUsableInSources = () => {
    const key = String(oauth.activeConnectorKey ?? 'pos_daily').trim() || 'pos_daily';
    return oauthSources.some((source) => {
      const connectorsRaw = (source as Record<string, unknown>)?.connectors;
      const connectors = Array.isArray(connectorsRaw) ? connectorsRaw : [];
      return isUsableConnector(findConnector(connectors, key));
    });
  };
  const hasUsableInProfiles = () => {
    const key = String(shared.activeConnectorKey ?? 'pos_daily').trim() || 'pos_daily';
    return sharedProfiles.some((profile) => {
      const connectorsRaw = (profile as Record<string, unknown>)?.connectors;
      const connectors = Array.isArray(connectorsRaw) ? connectorsRaw : [];
      return isUsableConnector(findConnector(connectors, key));
    });
  };

  if (activeIntegration === 'oauth') return hasUsableInSources();
  if (activeIntegration === 'shared') return hasUsableInProfiles();
  return hasUsableInSources() || hasUsableInProfiles();
};

export const resolvePosSheetsConfigured = (
  settings: IntegrationSettings | null,
  googleSheetsCanonical: GoogleSheetsCanonicalSettings | null | undefined
): boolean => {
  if (hasCanonicalConnectorConfig(googleSheetsCanonical)) return true;
  const gs = settings?.googleSheets;
  if (!gs) return false;

  const hasShared =
    gs.sharedSheets?.some((sheet) => {
      const mapped = sheet.columnsMap ?? sheet.lastMapping?.columnsMap ?? {};
      return Boolean(sheet.spreadsheetId) && Boolean(sheet.enabled) && Object.keys(mapped).length > 0;
    }) ?? false;

  const hasLegacyShared = (() => {
    const mapped = gs.sharedConfig?.columnsMap ?? gs.sharedConfig?.lastMapping?.columnsMap ?? {};
    return (
      Boolean(gs.sharedConfig?.spreadsheetId) &&
      Boolean(gs.sharedConfig?.enabled) &&
      Object.keys(mapped).length > 0
    );
  })();

  const hasOauth =
    gs.sources?.some(
      (source) => Boolean(source.spreadsheetId) && Object.keys(source.mapping ?? {}).length > 0
    ) ?? false;

  return hasShared || hasLegacyShared || hasOauth;
};

export const resolvePosSheetsConnected = (
  settings: IntegrationSettings | null,
  googleSheetsCanonical: GoogleSheetsCanonicalSettings | null | undefined
): boolean => {
  const gs = settings?.googleSheets;
  if (gs?.connected) return true;
  if (!googleSheetsCanonical || typeof googleSheetsCanonical !== 'object') return false;
  const canonical = googleSheetsCanonical as Record<string, unknown>;
  const oauth = (canonical.oauth ?? {}) as Record<string, unknown>;
  const shared = (canonical.shared ?? {}) as Record<string, unknown>;
  if (oauth.connected === true || shared.connected === true) return true;
  return resolvePosSheetsConfigured(settings, googleSheetsCanonical);
};
