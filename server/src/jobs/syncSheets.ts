import { Types } from 'mongoose';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { JobLockModel } from '../models/JobLock';
import {
  readSharedSheetRows,
  parseRowsWithHeaderRow,
  importRowsForCompany
} from '../controllers/posController';

export type RunSheetsSyncArgs = {
  source: string;
  dryRun?: boolean;
};

export type CompanySyncResult = {
  companyId: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  importedCount?: number;
  upsertedCount?: number;
  modifiedCount?: number;
  rowCount?: number;
  lastImportAt?: Date | null;
};

export type SheetsSyncResult = {
  ok: boolean;
  lockAcquired: boolean;
  totalCompanies: number;
  succeeded: number;
  failed: number;
  skipped: number;
  source: string;
  companies: CompanySyncResult[];
};

const LOCK_KEY = 'sheets-sync';
const LOCK_TTL_MS = 15 * 60 * 1000;

const acquireLock = async () => {
  const now = new Date();
  const existing = await JobLockModel.findOne({ key: LOCK_KEY }).lean();

  if (existing?.expiresAt && existing.expiresAt.getTime() > now.getTime()) {
    return false;
  }

  await JobLockModel.updateOne(
    { key: LOCK_KEY },
    {
      $set: {
        isLocked: true,
        lockedAt: now,
        expiresAt: new Date(now.getTime() + LOCK_TTL_MS)
      }
    },
    { upsert: true }
  );

  return true;
};

const releaseLock = async () => {
  const now = new Date();
  await JobLockModel.updateOne(
    { key: LOCK_KEY },
    {
      $set: {
        isLocked: false,
        expiresAt: new Date(now.getTime() - 1000)
      }
    }
  );
};

export const runSheetsSync = async ({ source, dryRun = false }: RunSheetsSyncArgs): Promise<SheetsSyncResult> => {
  const lockAcquired = await acquireLock();
  if (!lockAcquired) {
    return {
      ok: true,
      lockAcquired: false,
      totalCompanies: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      source,
      companies: []
    };
  }

  const companies: CompanySyncResult[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const settingsList = await IntegrationSettingsModel.find({
      'googleSheets.sharedConfig.enabled': true,
      'googleSheets.sharedConfig.spreadsheetId': { $ne: null }
    }).lean();

    if (settingsList.length === 0) {
      return {
        ok: true,
        lockAcquired: true,
        totalCompanies: 0,
        succeeded: 0,
        failed: 0,
        skipped: 1,
        source,
        companies: [
          {
            companyId: 'none',
            ok: true,
            skipped: true,
            reason: 'Sheets not configured for any company'
          }
        ]
      };
    }

    for (const settings of settingsList) {
      const companyId = (settings.companyId as Types.ObjectId).toString();
      const result: CompanySyncResult = {
        companyId,
        ok: false
      };

      try {
        const { source: sharedSource, rawRows, rowCount } = await readSharedSheetRows(companyId);
        result.rowCount = rowCount;

        if (rowCount === 0) {
          result.ok = true;
          result.skipped = true;
          result.reason = 'No data rows found in shared sheet';
          skipped += 1;
          companies.push(result);
          continue;
        }

        const parsedRows = parseRowsWithHeaderRow(rawRows, sharedSource.headerRow);
        if (parsedRows.length === 0) {
          result.ok = true;
          result.skipped = true;
          result.reason = 'No parsed rows after header processing';
          skipped += 1;
          companies.push(result);
          continue;
        }

        if (dryRun) {
          result.ok = true;
          result.skipped = true;
          result.importedCount = parsedRows.length;
          result.reason = 'dryRun';
          skipped += 1;
          companies.push(result);
          continue;
        }

        const importResult = await importRowsForCompany(companyId, parsedRows, 'google_sheets');
        if (!importResult.ok) {
          result.ok = false;
          result.reason = importResult.error?.message ?? 'Validation failed';
          failed += 1;
          companies.push(result);
          continue;
        }

        result.ok = true;
        result.importedCount = importResult.data.imported;
        result.upsertedCount = importResult.data.upserted;
        result.modifiedCount = importResult.data.modified;

        const updateRes = await IntegrationSettingsModel.findOneAndUpdate(
          { companyId },
          {
            $set: {
              lastImportSource: 'google_sheets',
              lastImportAt: new Date()
            }
          },
          { new: true }
        ).lean();

        result.lastImportAt = updateRes?.lastImportAt ?? null;
        succeeded += 1;
        companies.push(result);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[sheets-sync] Company sync failed', { companyId, err });
        result.ok = false;
        result.reason = err instanceof Error ? err.message : 'Unknown error';
        failed += 1;
        companies.push(result);
      }
    }
  } finally {
    await releaseLock();
  }

  return {
    ok: failed === 0,
    lockAcquired: true,
    totalCompanies: companies.length,
    succeeded,
    failed,
    skipped,
    source,
    companies
  };
};

