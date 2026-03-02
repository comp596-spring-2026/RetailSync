import { randomUUID } from 'node:crypto';

export type SharedSheetProfile = {
  profileId: string;
  name: string;
  spreadsheetId: string | null;
  spreadsheetTitle?: string | null;
  sheetName: string;
  sheetId?: number | null;
  headerRow: number;
  columnsMap?: Record<string, string>;
  enabled: boolean;
  shareStatus?: 'unknown' | 'not_shared' | 'shared' | 'no_permission' | 'not_found';
  availableTabs?: Array<{ sheetId: number; sheetName: string }>;
  ownerEmail?: string | null;
  modifiedTime?: string | null;
  lastMapping?: {
    columnsMap?: Record<string, string>;
    transformations?: Record<string, unknown>;
    createdAt?: Date | string | null;
    createdBy?: string | null;
  } | null;
  lastVerifiedAt?: Date | string | null;
  lastImportAt?: Date | string | null;
  isDefault?: boolean;
};

export const SHARED_SHEET_PROFILE_OPTIONS = ['POS DATA SHEET'] as const;
export type SharedSheetProfileName = (typeof SHARED_SHEET_PROFILE_OPTIONS)[number];
const DEFAULT_SHARED_SHEET_NAME: SharedSheetProfileName = 'POS DATA SHEET';

export const normalizeSharedSheetProfileName = (name?: string | null): SharedSheetProfileName | null => {
  if (!name) return null;
  const normalized = String(name).trim().toUpperCase();
  const found = SHARED_SHEET_PROFILE_OPTIONS.find((item) => item === normalized);
  return found ?? null;
};

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

export const normalizeStringRecord = (value: unknown): Record<string, string> => {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(Array.from(value.entries()).map(([k, v]) => [String(k), String(v)]));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  }
  return {};
};

export const isEmptyRecord = (obj: Record<string, unknown>) => Object.keys(obj).length === 0;

const toProfile = (entry: unknown): SharedSheetProfile => {
  const obj = asObject(entry);
  const lastMapping = asObject(obj.lastMapping);
  const normalizedName = normalizeSharedSheetProfileName(String(obj.name ?? ''));
  return {
    profileId: String(obj.profileId ?? randomUUID()),
    name: normalizedName ?? DEFAULT_SHARED_SHEET_NAME,
    spreadsheetId: obj.spreadsheetId ? String(obj.spreadsheetId) : null,
    spreadsheetTitle: obj.spreadsheetTitle ? String(obj.spreadsheetTitle) : null,
    sheetName: String(obj.sheetName ?? 'Sheet1'),
    sheetId: typeof obj.sheetId === 'number' ? obj.sheetId : null,
    headerRow: Math.max(1, Number(obj.headerRow ?? 1)),
    columnsMap: normalizeStringRecord(obj.columnsMap),
    enabled: Boolean(obj.enabled),
    shareStatus: ['unknown', 'not_shared', 'shared', 'no_permission', 'not_found'].includes(String(obj.shareStatus))
      ? (obj.shareStatus as SharedSheetProfile['shareStatus'])
      : 'unknown',
    availableTabs: Array.isArray(obj.availableTabs) ? (obj.availableTabs as Array<{ sheetId: number; sheetName: string }>) : undefined,
    ownerEmail: obj.ownerEmail ? String(obj.ownerEmail) : null,
    modifiedTime: obj.modifiedTime ? String(obj.modifiedTime) : null,
    lastMapping: {
      columnsMap: normalizeStringRecord(lastMapping.columnsMap),
      transformations: asObject(lastMapping.transformations),
      createdAt: (lastMapping.createdAt as Date | string | null | undefined) ?? null,
      createdBy: lastMapping.createdBy ? String(lastMapping.createdBy) : null
    },
    lastVerifiedAt: (obj.lastVerifiedAt as Date | string | null | undefined) ?? null,
    lastImportAt: (obj.lastImportAt as Date | string | null | undefined) ?? null,
    isDefault: Boolean(obj.isDefault)
  };
};

const fromLegacySharedConfig = (sharedConfig: unknown): SharedSheetProfile => {
  const sc = asObject(sharedConfig);
  const lastMapping = asObject(sc.lastMapping);
  return {
    profileId: randomUUID(),
    name: DEFAULT_SHARED_SHEET_NAME,
    spreadsheetId: sc.spreadsheetId ? String(sc.spreadsheetId) : null,
    spreadsheetTitle: sc.spreadsheetTitle ? String(sc.spreadsheetTitle) : null,
    sheetName: String(sc.sheetName ?? 'Sheet1'),
    sheetId: typeof sc.sheetId === 'number' ? sc.sheetId : null,
    headerRow: Math.max(1, Number(sc.headerRow ?? 1)),
    columnsMap: normalizeStringRecord(sc.columnsMap),
    enabled: Boolean(sc.enabled),
    shareStatus: ['unknown', 'not_shared', 'shared', 'no_permission', 'not_found'].includes(String(sc.shareStatus))
      ? (sc.shareStatus as SharedSheetProfile['shareStatus'])
      : 'unknown',
    availableTabs: Array.isArray(sc.availableTabs) ? (sc.availableTabs as Array<{ sheetId: number; sheetName: string }>) : undefined,
    ownerEmail: sc.ownerEmail ? String(sc.ownerEmail) : null,
    modifiedTime: sc.modifiedTime ? String(sc.modifiedTime) : null,
    lastMapping: {
      columnsMap: normalizeStringRecord(lastMapping.columnsMap),
      transformations: asObject(lastMapping.transformations),
      createdAt: (lastMapping.createdAt as Date | string | null | undefined) ?? null,
      createdBy: lastMapping.createdBy ? String(lastMapping.createdBy) : null
    },
    lastVerifiedAt: (sc.lastVerifiedAt as Date | string | null | undefined) ?? null,
    lastImportAt: (sc.lastImportAt as Date | string | null | undefined) ?? null,
    isDefault: true
  };
};

export const toLegacySharedConfig = (profiles: SharedSheetProfile[]) => {
  const primary = profiles.find((profile) => profile.isDefault) ?? profiles[0];
  if (!primary) {
    return {
      spreadsheetId: null,
      spreadsheetTitle: null,
      sheetName: 'Sheet1',
      sheetId: null,
      headerRow: 1,
      columnsMap: {},
      enabled: false,
      shareStatus: 'unknown',
      lastMapping: null,
      lastVerifiedAt: null,
      lastImportAt: null
    };
  }

  return {
    spreadsheetId: primary.spreadsheetId ?? null,
    spreadsheetTitle: primary.spreadsheetTitle ?? null,
    sheetName: primary.sheetName ?? 'Sheet1',
    sheetId: primary.sheetId ?? null,
    headerRow: primary.headerRow ?? 1,
    columnsMap: primary.columnsMap ?? {},
    enabled: Boolean(primary.enabled),
    shareStatus: primary.shareStatus ?? 'unknown',
    availableTabs: primary.availableTabs,
    ownerEmail: primary.ownerEmail ?? null,
    modifiedTime: primary.modifiedTime ?? null,
    lastMapping: primary.lastMapping ?? null,
    lastVerifiedAt: primary.lastVerifiedAt ?? null,
    lastImportAt: primary.lastImportAt ?? null
  };
};

export const ensureSharedSheets = (googleSheets: Record<string, unknown>) => {
  const current = Array.isArray(googleSheets.sharedSheets)
    ? (googleSheets.sharedSheets as unknown[]).map(toProfile)
    : [];
  let profiles = current;

  if (profiles.length === 0) {
    profiles = [fromLegacySharedConfig(googleSheets.sharedConfig)];
  }

  // Keep only supported profile names and ensure exactly the supported set exists.
  profiles = profiles.filter((profile) => normalizeSharedSheetProfileName(profile.name) !== null);
  for (const name of SHARED_SHEET_PROFILE_OPTIONS) {
    const existing = profiles.find((profile) => profile.name === name);
    if (!existing) {
      profiles.push({
        profileId: randomUUID(),
        name,
        spreadsheetId: null,
        sheetName: 'Sheet1',
        headerRow: 1,
        columnsMap: {},
        enabled: false,
        shareStatus: 'unknown',
        lastMapping: null,
        lastVerifiedAt: null,
        lastImportAt: null,
        isDefault: name === DEFAULT_SHARED_SHEET_NAME
      });
    }
  }

  if (!profiles.some((profile) => profile.name === DEFAULT_SHARED_SHEET_NAME && profile.isDefault)) {
    for (const profile of profiles) {
      profile.isDefault = profile.name === DEFAULT_SHARED_SHEET_NAME;
    }
  }

  googleSheets.sharedSheets = profiles as unknown as Record<string, unknown>;
  googleSheets.sharedConfig = toLegacySharedConfig(profiles);
  return profiles;
};

export const pickDefaultSharedSheet = (googleSheets: Record<string, unknown>) => {
  const profiles = ensureSharedSheets(googleSheets);
  return profiles.find((profile) => profile.isDefault) ?? profiles[0] ?? null;
};

export const upsertSharedSheet = (
  googleSheets: Record<string, unknown>,
  payload: Partial<SharedSheetProfile> & { profileName?: string }
) => {
  const profiles = ensureSharedSheets(googleSheets);
  const normalizedProfileName =
    normalizeSharedSheetProfileName(payload.profileName)
    ?? normalizeSharedSheetProfileName(payload.name)
    ?? undefined;
  const byId = payload.profileId ? profiles.findIndex((profile) => profile.profileId === payload.profileId) : -1;
  const byName = byId < 0 && normalizedProfileName
    ? profiles.findIndex((profile) => profile.name === normalizedProfileName)
    : -1;
  const index = byId >= 0 ? byId : byName;

  const existing = index >= 0 ? profiles[index] : null;
  const nextName = normalizedProfileName ?? existing?.name ?? DEFAULT_SHARED_SHEET_NAME;
  const has = (key: keyof SharedSheetProfile | 'profileName') =>
    Object.prototype.hasOwnProperty.call(payload, key);
  const next: SharedSheetProfile = {
    profileId: payload.profileId ?? existing?.profileId ?? randomUUID(),
    name: nextName,
    spreadsheetId: has('spreadsheetId') ? (payload.spreadsheetId ?? null) : (existing?.spreadsheetId ?? null),
    spreadsheetTitle: has('spreadsheetTitle') ? (payload.spreadsheetTitle ?? null) : (existing?.spreadsheetTitle ?? null),
    sheetName: has('sheetName') ? (payload.sheetName ?? 'Sheet1') : (existing?.sheetName ?? 'Sheet1'),
    sheetId: has('sheetId') ? (payload.sheetId ?? null) : (existing?.sheetId ?? null),
    headerRow: Math.max(1, Number(payload.headerRow ?? existing?.headerRow ?? 1)),
    columnsMap: payload.columnsMap ?? existing?.columnsMap ?? {},
    enabled: payload.enabled ?? existing?.enabled ?? false,
    shareStatus: payload.shareStatus ?? existing?.shareStatus ?? 'unknown',
    availableTabs: has('availableTabs') ? payload.availableTabs : existing?.availableTabs,
    ownerEmail: payload.ownerEmail ?? existing?.ownerEmail ?? null,
    modifiedTime: payload.modifiedTime ?? existing?.modifiedTime ?? null,
    lastMapping: has('lastMapping') ? (payload.lastMapping ?? null) : (existing?.lastMapping ?? null),
    lastVerifiedAt: has('lastVerifiedAt') ? (payload.lastVerifiedAt ?? null) : (existing?.lastVerifiedAt ?? null),
    lastImportAt: has('lastImportAt') ? (payload.lastImportAt ?? null) : (existing?.lastImportAt ?? null),
    isDefault: nextName === DEFAULT_SHARED_SHEET_NAME
  };

  if (index >= 0) profiles[index] = next;
  else profiles.push(next);

  for (const profile of profiles) {
    profile.isDefault = profile.name === DEFAULT_SHARED_SHEET_NAME;
  }

  googleSheets.sharedSheets = profiles as unknown as Record<string, unknown>;
  googleSheets.sharedConfig = toLegacySharedConfig(profiles);
  return next;
};
