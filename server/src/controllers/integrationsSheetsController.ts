import { Request, Response } from 'express';
import { z } from 'zod';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { fail, ok } from '../utils/apiResponse';
import { getSheetsClient } from '../integrations/google/sheets.client';

const SERVICE_ACCOUNT_EMAIL =
  'retailsync-run-sa@lively-infinity-488304-m9.iam.gserviceaccount.com';

const sharedConfigSchema = z.object({
  spreadsheetId: z.string().min(5).optional(),
  spreadsheetUrl: z.string().url().optional(),
  sheetName: z.string().min(1).default('Sheet1'),
  headerRow: z.coerce.number().int().min(1).default(1),
  columnsMap: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true)
});

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
            headerRow: 1,
            columnsMap: {},
            enabled: false,
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
      headerRow: 1,
      columnsMap: {},
      enabled: false,
      lastVerifiedAt: null,
      lastImportAt: null
    },
    updatedAt: new Date()
  }) as any;

  googleSheets.mode = 'service_account';
  googleSheets.serviceAccountEmail =
    googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL;
  googleSheets.sharedConfig = {
    ...googleSheets.sharedConfig,
    spreadsheetId,
    sheetName: parsed.data.sheetName,
    headerRow: parsed.data.headerRow,
    columnsMap: parsed.data.columnsMap,
    enabled: parsed.data.enabled
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
    const sheets = getSheetsClient();
    await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:A1`
    });

    googleSheets.connected = true;
    googleSheets.sharedConfig = {
      ...googleSheets.sharedConfig,
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
    const normalized = message.toLowerCase();
    const reason = normalized.includes('permission') || normalized.includes('forbidden')
      ? `Sheet is not shared with ${googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL} as required permissions`
      : normalized.includes('not found')
        ? 'Spreadsheet not found. Check spreadsheetId'
        : 'Unable to verify Google Sheets access';

    googleSheets.connected = false;
    googleSheets.updatedAt = new Date();
    await settings.save();

    return fail(res, reason, 403, {
      rawMessage: message,
      serviceAccountEmail: googleSheets.serviceAccountEmail || SERVICE_ACCOUNT_EMAIL
    });
  }
};
