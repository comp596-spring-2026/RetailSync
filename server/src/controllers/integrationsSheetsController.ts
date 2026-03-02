import { Request, Response } from 'express';
import { z } from 'zod';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { IntegrationSecretModel } from '../models/IntegrationSecret';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { fail, ok } from '../utils/apiResponse';
import {
  getDriveClientForServiceAccount,
  getSheetsClientForCompany
} from '../integrations/google/sheets.client';
import {
  ensureSharedSheets,
  normalizeSharedSheetProfileName,
  pickDefaultSharedSheet,
  SHARED_SHEET_PROFILE_OPTIONS,
  upsertSharedSheet
} from '../utils/sharedSheets';
import { normalizeUtcOffset } from '../utils/utcOffset';

const SERVICE_ACCOUNT_EMAIL =
  'retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com';
const DEFAULT_SYNC_UTC_OFFSET = 'UTC-08:00';

const sharedConfigSchema = z.object({
  profileId: z.string().optional(),
  profileName: z.string().min(1).optional(),
  spreadsheetId: z.string().min(5).optional(),
  spreadsheetUrl: z.string().url().optional(),
  sheetName: z.string().min(1).default('Sheet1'),
  headerRow: z.coerce.number().int().min(1).default(1),
  columnsMap: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true)
});

const utcOffsetSchema = z
  .string()
  .trim()
  .refine((value) => normalizeUtcOffset(value) !== null, {
    message: 'timezone must be in UTC offset format (e.g. UTC-08:00)'
  })
  .transform((value) => normalizeUtcOffset(value) as string);

const syncScheduleSchema = z.object({
  enabled: z.boolean(),
  hour: z.coerce.number().int().min(0).max(23),
  minute: z.coerce.number().int().min(0).max(59),
  timezone: utcOffsetSchema
});

const toSheetsError = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Google Sheets request failed';
  const normalized = message.toLowerCase();
  if (normalized.includes('permission') || normalized.includes('forbidden') || normalized.includes('403')) {
    return { message: 'not_shared', statusCode: 403, shareStatus: 'no_permission' as const };
  }
  if (normalized.includes('not found') || normalized.includes('404')) {
    return { message: 'not_found', statusCode: 404, shareStatus: 'not_found' as const };
  }
  return { message, statusCode: 500, shareStatus: 'unknown' as const };
};

const extractSpreadsheetId = (spreadsheetUrl: string) => {
  const match = spreadsheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
};

const getOrCreateSettings = async (companyId: string, userId: string) => {
  return IntegrationSettingsModel.findOneAndUpdate(
    { companyId },
    {
      $setOnInsert: {
        ownerUserId: userId,
        googleSheets: {
          mode: 'service_account',
          connected: false,
          connectedEmail: null,
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          sources: [],
          sharedSheets: [],
          sharedConfig: {
            spreadsheetId: null,
            sheetName: 'Sheet1',
            sheetId: null,
            headerRow: 1,
            columnsMap: {},
            enabled: false,
            shareStatus: 'unknown',
            oauthConnectedAccount: null,
            lastMapping: null,
            lastVerifiedAt: null,
            lastImportAt: null
          },
          syncSchedule: {
            enabled: false,
            hour: 2,
            minute: 0,
            timezone: DEFAULT_SYNC_UTC_OFFSET
          },
          lastScheduledSyncAt: null,
          updatedAt: new Date()
        },
        quickbooks: {
          connected: false,
          environment: 'sandbox',
          realmId: null,
          companyName: null,
          updatedAt: new Date()
        }
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

export const upsertSharedSheetsConfig = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = sharedConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  if (parsed.data.profileName && !normalizeSharedSheetProfileName(parsed.data.profileName)) {
    return fail(
      res,
      `profileName must be one of: ${SHARED_SHEET_PROFILE_OPTIONS.join(', ')}`,
      400
    );
  }

  const spreadsheetId =
    parsed.data.spreadsheetId?.trim() ||
    (parsed.data.spreadsheetUrl ? extractSpreadsheetId(parsed.data.spreadsheetUrl) : null);

  if (!spreadsheetId) {
    return fail(res, 'Provide spreadsheetId or a valid Google spreadsheetUrl', 400);
  }

  const settings = await getOrCreateSettings(companyId, userId);
  const googleSheets = (settings.googleSheets ?? {
    mode: 'service_account',
    connected: false,
    connectedEmail: null,
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
    sources: [],
    sharedSheets: [],
      sharedConfig: {
        spreadsheetId: null,
        sheetName: 'Sheet1',
        sheetId: null,
        headerRow: 1,
        columnsMap: {},
        enabled: false,
        shareStatus: 'unknown',
        oauthConnectedAccount: null,
        lastMapping: null,
        lastVerifiedAt: null,
        lastImportAt: null
      },
    updatedAt: new Date()
  }) as any;

  googleSheets.serviceAccountEmail =
    googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL;
  ensureSharedSheets(googleSheets);
  const profile = upsertSharedSheet(googleSheets, {
    profileId: parsed.data.profileId,
    profileName: parsed.data.profileName,
    spreadsheetId,
    sheetName: parsed.data.sheetName,
    headerRow: parsed.data.headerRow,
    columnsMap: parsed.data.columnsMap ?? {},
    enabled: parsed.data.enabled,
    shareStatus: 'unknown',
    lastVerifiedAt: null,
    isDefault: parsed.data.profileId == null
  });
  googleSheets.updatedAt = new Date();
  settings.googleSheets = googleSheets;
  await settings.save();

  return ok(res, {
    connected: Boolean(googleSheets.connected),
    serviceAccountEmail: googleSheets.serviceAccountEmail,
    sharedSheets: googleSheets.sharedSheets ?? [],
    activeProfile: profile,
    sharedConfig: googleSheets.sharedConfig
  });
};

export const listSpreadsheetTabs = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const settings = await getOrCreateSettings(companyId, userId);
  const googleSheets = (settings.googleSheets ?? {
    mode: 'service_account',
    connected: false,
    connectedEmail: null,
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
    sources: [],
    sharedSheets: [],
    sharedConfig: {
      spreadsheetId: null,
      sheetName: 'Sheet1',
      sheetId: null,
      headerRow: 1,
      columnsMap: {},
      enabled: false,
      shareStatus: 'unknown',
      oauthConnectedAccount: null,
      lastMapping: null,
      lastVerifiedAt: null,
      lastImportAt: null
    },
    updatedAt: new Date()
  }) as any;
  settings.googleSheets = googleSheets;
  ensureSharedSheets(googleSheets);
  const profileId = typeof (req.body as any)?.profileId === 'string' ? (req.body as any).profileId.trim() : '';
  const bodyAuthMode = typeof (req.body as any)?.authMode === 'string'
    ? String((req.body as any).authMode).trim()
    : '';
  const requestedAuthMode = bodyAuthMode === 'oauth' || bodyAuthMode === 'service_account'
    ? bodyAuthMode
    : null;
  const activeProfile = profileId
    ? (googleSheets.sharedSheets as any[]).find((profile) => profile.profileId === profileId) ?? null
    : pickDefaultSharedSheet(googleSheets);
  const bodyId = typeof (req.body as any)?.spreadsheetId === 'string' ? (req.body as any).spreadsheetId.trim() : '';
  const queryId = typeof req.query?.spreadsheetId === 'string' ? req.query.spreadsheetId.trim() : '';
  const overrideId = bodyId || queryId;
  const spreadsheetId = overrideId || activeProfile?.spreadsheetId?.trim() || '';
  if (!spreadsheetId) {
    return fail(res, 'No spreadsheet configured', 400);
  }

  try {
    const authMode = (requestedAuthMode ?? (googleSheets.mode === 'oauth' ? 'oauth' : 'service_account')) as 'oauth' | 'service_account';
    const sheets = await getSheetsClientForCompany(authMode, companyId);
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields:
        'spreadsheetId,properties.title,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
    });

    const tabs = (response.data.sheets ?? []).map((sheet) => {
      const properties = sheet.properties;
      return {
        sheetId: properties?.sheetId ?? null,
        title: properties?.title ?? '',
        index: properties?.index ?? 0,
        rowCount: properties?.gridProperties?.rowCount ?? null,
        columnCount: properties?.gridProperties?.columnCount ?? null
      };
    });

    return ok(res, {
      spreadsheetId: response.data.spreadsheetId,
      title: response.data.properties?.title ?? null,
      profileId: activeProfile?.profileId ?? null,
      tabs
    });
  } catch (error) {
    const sheetError = toSheetsError(error);
    upsertSharedSheet(googleSheets, {
      profileId: activeProfile?.profileId,
      profileName: activeProfile?.name,
      shareStatus: sheetError.shareStatus
    });
    googleSheets.updatedAt = new Date();
    settings.googleSheets = googleSheets;
    await settings.save();
    return fail(res, sheetError.message, sheetError.statusCode);
  }
};

const saveMappingSchema = z.object({
  mode: z.enum(['oauth', 'service_account']),
  sourceId: z.string().optional(),
  profileId: z.string().optional(),
  profileName: z.string().optional(),
  columnsMap: z.record(z.string(), z.string()),
  transformations: z.record(z.string(), z.any()).optional()
});

const deleteSourceSchema = z.object({
  mode: z.enum(['oauth', 'service_account']),
  profileId: z.string().optional(),
  profileName: z.string().optional(),
  sourceId: z.string().optional(),
  deleteType: z.enum(['soft', 'hard']),
  confirmText: z.string().min(1)
});

const normalizeTargetValue = (target: string) => {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('custom:')) {
    return `custom:${trimmed.replace(/^custom:/, '').trim().toLowerCase()}`;
  }
  return trimmed.toLowerCase();
};

const getDuplicateTargets = (columnsMap: Record<string, string>) => {
  const counts = new Map<string, number>();
  for (const value of Object.values(columnsMap)) {
    if (!value) continue;
    const key = normalizeTargetValue(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
};

export const saveGoogleSheetsMapping = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = saveMappingSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  if (parsed.data.mode === 'service_account' && parsed.data.profileName && !normalizeSharedSheetProfileName(parsed.data.profileName)) {
    return fail(
      res,
      `profileName must be one of: ${SHARED_SHEET_PROFILE_OPTIONS.join(', ')}`,
      400
    );
  }
  const duplicateTargets = getDuplicateTargets(parsed.data.columnsMap);
  if (duplicateTargets.length > 0) {
    return fail(
      res,
      `One-to-one mapping required. Duplicate target fields: ${duplicateTargets.join(', ')}`,
      400
    );
  }

  const settings = await getOrCreateSettings(companyId, userId);
  const googleSheets = (settings.googleSheets ?? {}) as any;
  ensureSharedSheets(googleSheets);

  const audit = {
    columnsMap: parsed.data.columnsMap,
    transformations: parsed.data.transformations ?? {},
    createdAt: new Date(),
    createdBy: userId
  };

  if (parsed.data.mode === 'oauth' && parsed.data.sourceId) {
    const idx = (googleSheets.sources ?? []).findIndex((s: any) => s.sourceId === parsed.data.sourceId);
    if (idx >= 0) {
      googleSheets.sources[idx].mapping = parsed.data.columnsMap;
      googleSheets.sources[idx].transformations = parsed.data.transformations ?? {};
    }
  } else {
    upsertSharedSheet(googleSheets, {
      profileId: parsed.data.profileId,
      profileName: parsed.data.profileName,
      columnsMap: parsed.data.columnsMap,
      lastMapping: audit
    });
  }

  googleSheets.updatedAt = new Date();
  settings.googleSheets = googleSheets;
  await settings.save();

  return ok(res, { ok: true, columnsMap: parsed.data.columnsMap });
};

export const deleteGoogleSheetsSourceBinding = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = deleteSourceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const expectedConfirm = parsed.data.deleteType === 'hard' ? 'HARD RESET' : 'SOFT RESET';
  if (parsed.data.confirmText.trim().toUpperCase() !== expectedConfirm) {
    return fail(res, `confirmText must match "${expectedConfirm}"`, 400);
  }

  const settings = await getOrCreateSettings(companyId, userId);
  const googleSheets = (settings.googleSheets ?? {}) as any;
  ensureSharedSheets(googleSheets);
  await IntegrationSecretModel.findOneAndDelete({
    companyId,
    provider: 'google_oauth'
  });

  googleSheets.connected = false;
  googleSheets.connectedEmail = null;
  googleSheets.mode = 'service_account';
  googleSheets.sources = [];

  const sharedProfiles = ensureSharedSheets(googleSheets);
  googleSheets.sharedSheets = sharedProfiles.map((profile: any) => ({
    ...profile,
    spreadsheetId: null,
    spreadsheetTitle: null,
    sheetName: 'Sheet1',
    sheetId: null,
    headerRow: 1,
    columnsMap: {},
    enabled: false,
    shareStatus: 'unknown',
    availableTabs: undefined,
    lastMapping: null,
    lastVerifiedAt: null,
    lastImportAt: null
  }));

  googleSheets.sharedConfig = {
    ...(googleSheets.sharedConfig ?? {}),
    spreadsheetId: null,
    spreadsheetTitle: null,
    sheetName: 'Sheet1',
    sheetId: null,
    headerRow: 1,
    columnsMap: {},
    enabled: false,
    shareStatus: 'unknown',
    availableTabs: undefined,
    lastMapping: null,
    lastVerifiedAt: null,
    lastImportAt: null
  };

  if (googleSheets.syncSchedule) {
    googleSheets.syncSchedule.enabled = false;
  }

  let deletedRows = 0;
  if (parsed.data.deleteType === 'hard') {
    const deleteResult = await POSDailySummaryModel.deleteMany({
      companyId,
      source: 'google_sheets'
    });
    deletedRows = deleteResult.deletedCount ?? 0;
  }

  googleSheets.updatedAt = new Date();
  settings.googleSheets = googleSheets;
  await settings.save();

  return ok(res, {
    ok: true,
    deleteType: parsed.data.deleteType,
    deletedRows,
    target: {
      scope: 'all_google_sheets_config',
      modeRequested: parsed.data.mode,
      profileNameRequested: parsed.data.profileName ?? null
    }
  });
};

/** List spreadsheets shared with the service account (for Shared Sheet flow). */
export const listSharedWithServiceAccountSpreadsheets = async (req: Request, res: Response) => {
  if (!req.user?.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  try {
    const drive = getDriveClientForServiceAccount();
    const q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
    const response = await drive.files.list({
      q,
      orderBy: 'modifiedTime desc',
      pageSize: 100,
      fields: 'files(id,name,mimeType,modifiedTime)'
    });

    const files = (response.data.files ?? [])
      .filter((f) => !!f.id && !!f.name && f.mimeType === 'application/vnd.google-apps.spreadsheet')
      .map((f) => ({
        id: f.id as string,
        name: f.name as string,
        mimeType: f.mimeType ?? null,
        modifiedTime: f.modifiedTime ?? null
      }));

    return ok(res, { files });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list spreadsheets shared with service account';
    return fail(res, message, 400);
  }
};

export const verifySharedSheetsConfig = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const settings = await getOrCreateSettings(companyId, userId);
  const googleSheets = (settings.googleSheets ?? {
    mode: 'service_account',
    connected: false,
    connectedEmail: null,
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
    sources: [],
    sharedSheets: [],
    sharedConfig: {
      spreadsheetId: null,
      sheetName: 'Sheet1',
      headerRow: 1,
      columnsMap: {},
      enabled: false,
      lastVerifiedAt: null,
      lastImportAt: null
    },
    updatedAt: new Date()
  }) as any;
  settings.googleSheets = googleSheets;
  ensureSharedSheets(googleSheets);
  const bodyProfileId = typeof (req.body as any)?.profileId === 'string' ? (req.body as any).profileId.trim() : '';
  const targetProfile = bodyProfileId
    ? (googleSheets.sharedSheets as any[]).find((sheet) => sheet.profileId === bodyProfileId)
    : pickDefaultSharedSheet(googleSheets);
  const spreadsheetId = targetProfile?.spreadsheetId?.trim() ?? '';
  const sheetName = targetProfile?.sheetName?.trim() || 'Sheet1';
  const headerRow = Number(targetProfile?.headerRow ?? 1);

  if (!spreadsheetId) {
    return fail(res, 'Shared sheets config is missing spreadsheetId', 400);
  }

  try {
    const authMode: 'service_account' = 'service_account';
    const sheets = await getSheetsClientForCompany(authMode, companyId);

    const [metaRes, valuesRes] = await Promise.all([
      sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'spreadsheetId,properties(title),sheets(properties(sheetId,title))'
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A1:Z${Math.min(headerRow + 5, 20)}`
      })
    ]);

    const spreadsheetTitle = (metaRes.data.properties as any)?.title ?? null;
    const availableTabs = (metaRes.data.sheets ?? []).map((s) => {
      const p = s.properties;
      return { sheetId: p?.sheetId ?? 0, sheetName: (p?.title as string) ?? '' };
    });

    const rawRows = (valuesRes.data.values ?? []).map((row) => row.map((c) => String(c ?? '')));
    const preview = rawRows.slice(0, 10);

    googleSheets.connected = true;
    upsertSharedSheet(googleSheets, {
      profileId: targetProfile?.profileId,
      profileName: targetProfile?.name,
      spreadsheetId,
      spreadsheetTitle,
      sheetName,
      headerRow,
      shareStatus: 'shared',
      availableTabs,
      lastVerifiedAt: new Date(),
      enabled: targetProfile?.enabled ?? true
    });
    googleSheets.updatedAt = new Date();
    await settings.save();

    return ok(res, {
      ok: true,
      shareStatus: 'shared',
      spreadsheetTitle,
      tabs: availableTabs,
      preview,
      connected: true,
      serviceAccountEmail: googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL,
      sharedSheets: googleSheets.sharedSheets ?? [],
      sharedConfig: googleSheets.sharedConfig
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets verify failed';
    const sheetError = toSheetsError(error);

    googleSheets.connected = false;
    upsertSharedSheet(googleSheets, {
      profileId: targetProfile?.profileId,
      profileName: targetProfile?.name,
      shareStatus: sheetError.shareStatus,
      lastVerifiedAt: new Date()
    });
    googleSheets.updatedAt = new Date();
    await settings.save();

    return fail(res, sheetError.message, sheetError.statusCode, {
      rawMessage: message,
      serviceAccountEmail: googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL
    });
  }
};

export const upsertSheetsSyncSchedule = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = syncScheduleSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const settings = await getOrCreateSettings(companyId, userId);
  const googleSheets = (settings.googleSheets ?? {
    mode: 'service_account',
    connected: false,
    connectedEmail: null,
    serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
    sources: [],
    sharedSheets: [],
    sharedConfig: {
      spreadsheetId: null,
      sheetName: 'Sheet1',
      headerRow: 1,
      columnsMap: {},
      enabled: false,
      lastVerifiedAt: null,
      lastImportAt: null
    },
    syncSchedule: {
      enabled: false,
      hour: 2,
      minute: 0,
      timezone: DEFAULT_SYNC_UTC_OFFSET
    },
    lastScheduledSyncAt: null,
    updatedAt: new Date()
  }) as any;
  settings.googleSheets = googleSheets;
  ensureSharedSheets(googleSheets);
  googleSheets.syncSchedule = {
    enabled: parsed.data.enabled,
    hour: parsed.data.hour,
    minute: parsed.data.minute,
    timezone: parsed.data.timezone
  };
  googleSheets.updatedAt = new Date();
  await settings.save();

  return ok(res, {
    syncSchedule: googleSheets.syncSchedule,
    lastScheduledSyncAt: googleSheets.lastScheduledSyncAt ?? null
  });
};
