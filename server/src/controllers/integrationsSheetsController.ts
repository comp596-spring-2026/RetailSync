import { Request, Response } from 'express';
import { z } from 'zod';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { fail, ok } from '../utils/apiResponse';
import { getSheetsClientForCompany } from '../integrations/google/sheets.client';

const SERVICE_ACCOUNT_EMAIL =
  'retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com';

const sharedConfigSchema = z.object({
  spreadsheetId: z.string().min(5).optional(),
  spreadsheetUrl: z.string().url().optional(),
  sheetName: z.string().min(1).default('Sheet1'),
  headerRow: z.coerce.number().int().min(1).default(1),
  columnsMap: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true)
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
  googleSheets.sharedConfig = {
    ...googleSheets.sharedConfig,
    spreadsheetId,
    sheetName: parsed.data.sheetName,
    headerRow: parsed.data.headerRow,
    columnsMap: parsed.data.columnsMap ?? (googleSheets.sharedConfig as any)?.columnsMap ?? {},
    enabled: parsed.data.enabled,
    shareStatus: 'unknown',
    lastVerifiedAt: null
  } as any;
  googleSheets.updatedAt = new Date();
  settings.googleSheets = googleSheets;
  await settings.save();

  return ok(res, {
    connected: Boolean(googleSheets.connected),
    serviceAccountEmail: googleSheets.serviceAccountEmail,
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
  const sharedConfig = settings.googleSheets?.sharedConfig as
    | { spreadsheetId?: string | null }
    | undefined;
  const spreadsheetId = sharedConfig?.spreadsheetId?.trim() ?? '';
  if (!spreadsheetId) {
    return fail(res, 'No spreadsheet configured', 400);
  }

  try {
    const authMode = googleSheets.mode === 'oauth' ? 'oauth' : 'service_account';
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
      tabs
    });
  } catch (error) {
    const sheetError = toSheetsError(error);
    googleSheets.sharedConfig = {
      ...(googleSheets.sharedConfig as any),
      shareStatus: sheetError.shareStatus
    };
    googleSheets.updatedAt = new Date();
    settings.googleSheets = googleSheets;
    await settings.save();
    return fail(res, sheetError.message, sheetError.statusCode);
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

  const sharedConfig = googleSheets.sharedConfig as
    | { spreadsheetId?: string | null; sheetName?: string | null }
    | undefined;

  const spreadsheetId = sharedConfig?.spreadsheetId?.trim() ?? '';
  const sheetName = sharedConfig?.sheetName?.trim() || 'Sheet1';

  if (!spreadsheetId) {
    return fail(res, 'Shared sheets config is missing spreadsheetId', 400);
  }

  try {
    const authMode = googleSheets.mode === 'oauth' ? 'oauth' : 'service_account';
    const sheets = await getSheetsClientForCompany(authMode, companyId);
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:A1`
    });

    googleSheets.connected = true;
    googleSheets.sharedConfig = {
      ...googleSheets.sharedConfig,
      shareStatus: 'shared',
      lastVerifiedAt: new Date()
    } as any;
    googleSheets.updatedAt = new Date();
    await settings.save();

    return ok(res, {
      connected: true,
      message: 'Shared sheet is connected.',
      serviceAccountEmail: googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL,
      sharedConfig: googleSheets.sharedConfig
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Sheets verify failed';
    const sheetError = toSheetsError(error);

    googleSheets.connected = false;
    googleSheets.sharedConfig = {
      ...googleSheets.sharedConfig,
      shareStatus: sheetError.shareStatus,
      lastVerifiedAt: new Date()
    } as any;
    googleSheets.updatedAt = new Date();
    await settings.save();

    return fail(res, sheetError.message, sheetError.statusCode, {
      rawMessage: message,
      serviceAccountEmail: googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL
    });
  }
};
