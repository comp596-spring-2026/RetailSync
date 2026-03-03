import { Types } from 'mongoose';
import { markConnectorImported } from '../controllers/googleSheetsController';
import {
  importEvaluatedRowsForCompany,
  parseRowsWithHeaderRow,
  readSharedSheetRows
} from '../controllers/posController';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { JobLockModel } from '../models/JobLock';
import { computeCompatibilityForConnector } from '../utils/sheetsCompatibility';
import { DEFAULT_CONNECTOR_KEY } from '../utils/sheetsConnectors';
import { parseUtcOffsetToMinutes } from '../utils/utcOffset';
import {
  evaluateConfiguredPosRow,
  validateDerivedConfiguration
} from '../utils/posDerivedEvaluator';

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

type ConnectorSchedule = {
  enabled?: boolean;
  frequency?: 'hourly' | 'daily' | 'weekly' | 'manual';
  timeOfDay?: string;
  dayOfWeek?: number;
};

const LOCK_KEY = 'sheets-sync';
const LOCK_TTL_MS = 15 * 60 * 1000;
const DEFAULT_SYNC_UTC_OFFSET = 'UTC-08:00';

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

const getLocalDateParts = (date: Date, offsetMinutes: number) => {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay()
  };
};

const parseTimeOfDay = (timeOfDay?: string) => {
  if (!timeOfDay) return { hour: 2, minute: 0 };
  const [hh, mm] = String(timeOfDay).split(':');
  const hour = Number(hh);
  const minute = Number(mm);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return { hour: 2, minute: 0 };
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return { hour: 2, minute: 0 };
  return { hour, minute };
};

const isScheduleDue = (
  schedule: ConnectorSchedule | undefined,
  lastScheduledSyncAt: Date | null,
  now = new Date()
) => {
  if (!schedule?.enabled) return true;

  const offsetMinutes =
    parseUtcOffsetToMinutes(DEFAULT_SYNC_UTC_OFFSET) ??
    parseUtcOffsetToMinutes('UTC+00:00') ??
    0;

  const nowParts = getLocalDateParts(now, offsetMinutes);
  const { hour: targetHour, minute: targetMinute } = parseTimeOfDay(schedule.timeOfDay);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const targetMinutes = targetHour * 60 + targetMinute;

  if (schedule.frequency === 'manual') return false;
  if (nowMinutes < targetMinutes) return false;

  if (schedule.frequency === 'weekly' && Number.isFinite(schedule.dayOfWeek)) {
    if (nowParts.weekday !== Number(schedule.dayOfWeek)) return false;
  }

  if (!lastScheduledSyncAt) return true;

  const lastParts = getLocalDateParts(lastScheduledSyncAt, offsetMinutes);
  const sameDay =
    lastParts.year === nowParts.year &&
    lastParts.month === nowParts.month &&
    lastParts.day === nowParts.day;

  if (schedule.frequency === 'hourly') {
    const sameHour = sameDay && lastParts.hour === nowParts.hour;
    return !sameHour;
  }

  if (schedule.frequency === 'daily') {
    return !sameDay;
  }

  if (schedule.frequency === 'weekly') {
    const lastWeekday = lastParts.weekday;
    return !(sameDay && lastWeekday === nowParts.weekday);
  }

  return true;
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
      companyId: { $exists: true },
      'googleSheets.activeIntegration': 'shared',
      'googleSheets.shared.enabled': true,
      'googleSheets.shared.activeProfileId': { $ne: null }
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
      const companyId =
        settings.companyId instanceof Types.ObjectId
          ? settings.companyId.toString()
          : String(settings.companyId);

      const result: CompanySyncResult = { companyId, ok: false };

      try {
        const googleSheets = (settings as any).googleSheets ?? {};
        const shared = googleSheets.shared ?? {};
        const activeProfileId = shared.activeProfileId?.toString?.() ?? String(shared.activeProfileId ?? '');
        const activeConnectorKey = String(shared.activeConnectorKey ?? DEFAULT_CONNECTOR_KEY) || DEFAULT_CONNECTOR_KEY;

        const profile = (shared.profiles ?? []).find((entry: any) => {
          const id = entry?._id?.toString?.() ?? String(entry?._id ?? '');
          return id === activeProfileId;
        });

        if (!profile) {
          result.ok = true;
          result.skipped = true;
          result.reason = 'Active shared profile not found';
          skipped += 1;
          companies.push(result);
          continue;
        }

        const connector = (profile.connectors ?? []).find(
          (entry: any) => String(entry?.key ?? '') === activeConnectorKey
        );

        if (!connector || connector.enabled !== true) {
          result.ok = true;
          result.skipped = true;
          result.reason = 'Active connector not configured or disabled';
          skipped += 1;
          companies.push(result);
          continue;
        }

        if (activeConnectorKey !== 'pos_daily') {
          result.ok = true;
          result.skipped = true;
          result.reason = `Connector ${activeConnectorKey} importer not implemented in v1`;
          skipped += 1;
          companies.push(result);
          continue;
        }

        const schedule = (connector.schedule ?? {}) as ConnectorSchedule;
        const lastScheduledSyncAt = (shared.lastScheduledSyncAt as Date | null | undefined) ?? null;
        if (!isScheduleDue(schedule, lastScheduledSyncAt, new Date())) {
          result.ok = true;
          result.skipped = true;
          result.reason = 'Not due by schedule';
          skipped += 1;
          companies.push(result);
          continue;
        }

        const { source: sharedSource, rawRows, rowCount } = await readSharedSheetRows(companyId, {
          profileId: activeProfileId,
          connectorKey: activeConnectorKey
        });
        result.rowCount = rowCount;

        if (rowCount === 0) {
          result.ok = true;
          result.skipped = true;
          result.reason = 'No rows in sheet';
          skipped += 1;
          companies.push(result);
          continue;
        }

        const headerIndex = Math.max(0, Number(sharedSource.headerRow ?? 1) - 1);
        const columns = rawRows[headerIndex] ?? [];
        const mapping = sharedSource.mapping ?? {};
        const compatibility = computeCompatibilityForConnector({
          connectorKey: activeConnectorKey,
          columns,
          mapping
        });

        if (compatibility.status === 'error') {
          result.ok = false;
          result.reason = 'Connector mapping incompatible';
          failed += 1;
          companies.push(result);
          continue;
        }
        const derivedValidation = validateDerivedConfiguration({
          headers: columns,
          mapping,
          transformations: sharedSource.transformations ?? {}
        });
        if (!derivedValidation.ok) {
          result.ok = false;
          result.reason = `Derived mapping invalid: ${derivedValidation.errors.join(', ')}`;
          failed += 1;
          companies.push(result);
          continue;
        }

        const parsedRows = parseRowsWithHeaderRow(rawRows, Number(sharedSource.headerRow ?? 1));
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
          result.reason = 'dryRun';
          result.importedCount = parsedRows.length;
          skipped += 1;
          companies.push(result);
          continue;
        }

        const evaluatedRows = [];
        let evaluationError: string | null = null;
        for (let index = 0; index < parsedRows.length; index += 1) {
          const evaluated = evaluateConfiguredPosRow({
            row: parsedRows[index],
            mapping,
            transformations: sharedSource.transformations ?? {}
          });
          if (!evaluated.ok) {
            evaluationError = `Row ${index + 1}: ${evaluated.reason}`;
            break;
          }
          evaluatedRows.push(evaluated.row);
        }
        if (evaluationError) {
          result.ok = false;
          result.reason = evaluationError;
          failed += 1;
          companies.push(result);
          continue;
        }
        const importBindingKey = `sheets:shared:${activeProfileId}:${activeConnectorKey}:${sharedSource.spreadsheetId}:${sharedSource.sheetName}`;
        const derivedFields = Object.entries(derivedValidation.derivedConfig)
          .map(([key]) => key);

        const importResult = await importEvaluatedRowsForCompany(companyId, evaluatedRows, 'google_sheets', {
          importBindingKey,
          derivedFields,
          sourceRef: {
            mode: 'shared',
            profileName: sharedSource.profileName ?? null,
            spreadsheetId: sharedSource.spreadsheetId,
            sheetName: sharedSource.sheetName,
            sourceId: activeProfileId,
            reason: 'Scheduled sync'
          }
        });

        if (!importResult.ok) {
          result.ok = false;
          result.reason = 'message' in importResult.error ? importResult.error.message : 'Validation failed';
          failed += 1;
          companies.push(result);
          continue;
        }

        const importedAt = new Date();
        await markConnectorImported({
          companyId,
          integrationType: 'shared',
          profileId: activeProfileId,
          connectorKey: activeConnectorKey,
          importedAt
        });

        await IntegrationSettingsModel.updateOne(
          { companyId },
          { $set: { 'googleSheets.shared.lastScheduledSyncAt': importedAt } }
        );

        result.ok = true;
        result.importedCount = importResult.data.imported;
        result.upsertedCount = importResult.data.upserted;
        result.modifiedCount = importResult.data.modified;
        result.lastImportAt = importedAt;
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
