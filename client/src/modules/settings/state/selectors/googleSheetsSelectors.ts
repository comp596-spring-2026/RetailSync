import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../../../app/store';
import { POS_DAILY_REQUIRED_FIELDS } from '../../constants/posDailyRequiredFields';
import type {
  GoogleSheetsCanonicalSettings,
  IntegrationMode,
  IntegrationSettingsCanonical,
  OAuthSource,
  SharedProfile,
  SheetConnector,
} from '../../types/googleSheets';

export const selectSettingsRoot = (state: RootState) =>
  ((state as unknown as { settings?: { settings?: IntegrationSettingsCanonical | null } }).settings?.settings ?? null);

export const selectGoogleSheetsSettings = createSelector(
  [selectSettingsRoot],
  (settings): GoogleSheetsCanonicalSettings | null => settings?.googleSheets ?? null,
);

export const selectActiveIntegration = createSelector(
  [selectGoogleSheetsSettings],
  (googleSheets): IntegrationMode | null => googleSheets?.activeIntegration ?? null,
);

export const selectActiveProfileId = createSelector(
  [selectGoogleSheetsSettings],
  (googleSheets) => googleSheets?.shared.activeProfileId ?? null,
);

export const selectActiveSourceId = createSelector(
  [selectGoogleSheetsSettings],
  (googleSheets) => googleSheets?.oauth.activeSourceId ?? null,
);

export const selectActiveConnectorKey = createSelector(
  [selectGoogleSheetsSettings, selectActiveIntegration],
  (googleSheets, mode) => {
    if (!googleSheets || !mode) return null;
    return mode === 'oauth'
      ? (googleSheets.oauth.activeConnectorKey ?? null)
      : (googleSheets.shared.activeConnectorKey ?? null);
  },
);

export const selectActiveProfile = createSelector(
  [selectGoogleSheetsSettings, selectActiveProfileId],
  (googleSheets, profileId): SharedProfile | null => {
    if (!googleSheets || !profileId) return null;
    return googleSheets.shared.profiles.find((profile) => profile.id === profileId) ?? null;
  },
);

export const selectActiveSource = createSelector(
  [selectGoogleSheetsSettings, selectActiveSourceId],
  (googleSheets, sourceId): OAuthSource | null => {
    if (!googleSheets || !sourceId) return null;
    return googleSheets.oauth.sources.find((source) => source.id === sourceId) ?? null;
  },
);

export const selectActiveConnector = createSelector(
  [selectActiveIntegration, selectActiveConnectorKey, selectActiveProfile, selectActiveSource],
  (mode, connectorKey, profile, source): SheetConnector | null => {
    if (!mode || !connectorKey) return null;
    const connectors = mode === 'oauth' ? (source?.connectors ?? []) : (profile?.connectors ?? []);
    return connectors.find((connector) => connector.key === connectorKey) ?? null;
  },
);

const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const hashString = (input: string): string => {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
};

export const computeMappingHash = (
  mapping: Record<string, string>,
  spreadsheetId: string,
  sheetName: string,
  headerRow: number,
) => {
  const payload = {
    spreadsheetId,
    sheetName,
    headerRow,
    mapping: Object.fromEntries(
      Object.entries(mapping)
        .filter(([column, target]) => Boolean(String(column).trim()) && Boolean(String(target).trim()))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
  return hashString(stableStringify(payload));
};

export const selectSheetInfoDisplay = createSelector(
  [selectActiveIntegration, selectActiveConnector, selectActiveProfile, selectActiveSource],
  (mode, connector, profile, source) => {
    const spreadsheetId = connector?.spreadsheetId ?? null;
    const url = spreadsheetId
      ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
      : null;
    return {
      integrationMode: mode,
      spreadsheetTitle: connector?.spreadsheetTitle?.trim() || 'Unknown spreadsheet',
      spreadsheetId,
      sheetName: connector?.sheetName ?? null,
      headerRow: connector?.headerRow ?? null,
      url,
      connectorLabel: connector?.label ?? null,
      ownerLabel: mode === 'oauth' ? (source?.name ?? null) : (profile?.name ?? null),
    };
  },
);

export const selectMappingSummary = createSelector(
  [selectActiveConnector],
  (connector) => {
    if (!connector) {
      return {
        mappedCount: 0,
        missingRequiredCount: POS_DAILY_REQUIRED_FIELDS.length,
        missingRequiredFields: [...POS_DAILY_REQUIRED_FIELDS],
        duplicatesCount: 0,
        duplicates: [] as string[],
        isValid: false,
      };
    }

    const mapping = connector.mapping ?? {};
    const mappedCount = Object.entries(mapping).filter(([column, target]) =>
      Boolean(String(column).trim()) && Boolean(String(target).trim())
    ).length;

    const mappedTargets = new Set(
      Object.values(mapping)
        .map((value) => String(value).trim())
        .filter(Boolean),
    );

    const missingRequiredFields = POS_DAILY_REQUIRED_FIELDS.filter((field) => !mappedTargets.has(field));

    const targetCounts = new Map<string, number>();
    for (const target of Object.values(mapping)) {
      const normalized = String(target).trim().toLowerCase();
      if (!normalized) continue;
      targetCounts.set(normalized, (targetCounts.get(normalized) ?? 0) + 1);
    }

    const duplicates = Array.from(targetCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([target]) => target);

    return {
      mappedCount,
      missingRequiredCount: missingRequiredFields.length,
      missingRequiredFields,
      duplicatesCount: duplicates.length,
      duplicates,
      isValid: missingRequiredFields.length === 0 && duplicates.length === 0,
    };
  },
);

export const selectLastSyncInfo = createSelector(
  [selectActiveConnector],
  (connector) => {
    const lastImportAt = connector?.lastImportAt ?? null;
    return {
      lastImportAt,
      lastImportDisplay: lastImportAt ? new Date(lastImportAt).toLocaleString() : '—',
      hasEverSynced: Boolean(lastImportAt),
    };
  },
);

export const selectMappingReadiness = createSelector(
  [selectActiveConnector, selectMappingSummary],
  (connector, summary): 'not_configured' | 'invalid' | 'needs_review' | 'ready' => {
    if (!connector) return 'not_configured';
    if (!connector.spreadsheetId || !connector.sheetName) return 'not_configured';
    if (!summary.isValid) return 'invalid';

    const computedHash = computeMappingHash(
      connector.mapping ?? {},
      connector.spreadsheetId,
      connector.sheetName,
      Number(connector.headerRow ?? 1),
    );

    const isConfirmed = Boolean(
      connector.mappingConfirmedAt &&
      connector.mappingHash &&
      connector.mappingHash === computedHash,
    );

    return isConfirmed ? 'ready' : 'needs_review';
  },
);

export const selectActionAvailability = createSelector(
  [selectMappingReadiness, selectActiveIntegration, selectGoogleSheetsSettings],
  (readiness, mode, googleSheets) => {
    const configured = readiness !== 'not_configured';
    const oauthConnected = googleSheets?.oauth.connectionStatus === 'connected';

    return {
      canSyncNow: readiness === 'ready',
      canReviewMapping: readiness === 'needs_review' || readiness === 'invalid',
      canChangeSheet: configured,
      canDeleteConfig: configured,
      showReconnectOAuth: mode === 'oauth' && !oauthConnected,
    };
  },
);
