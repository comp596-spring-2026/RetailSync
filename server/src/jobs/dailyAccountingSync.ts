import { Types } from 'mongoose';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { markQuickBooksSyncFailure, markQuickBooksSyncRunning } from '../services/quickbooksSyncService';
import { enqueueAccountingJob } from './accountingQueue';
import { runSheetsSync, SheetsSyncResult } from './syncSheets';

export type DailyQuickBooksCompanyResult = {
  companyId: string;
  ok: boolean;
  refreshTaskId?: string;
  postTaskId?: string;
  mode?: 'inline' | 'cloud';
  error?: string;
};

export type DailyQuickBooksSyncResult = {
  totalConnected: number;
  queued: number;
  wouldQueue: number;
  failed: number;
  companies: DailyQuickBooksCompanyResult[];
};

export type RunDailyAccountingSyncArgs = {
  source: string;
  dryRun?: boolean;
  includeSheets?: boolean;
  includeQuickBooks?: boolean;
  postDelaySeconds?: number;
};

export type RunDailyAccountingSyncResult = {
  ok: boolean;
  source: string;
  dryRun: boolean;
  includeSheets: boolean;
  includeQuickBooks: boolean;
  sheets?: SheetsSyncResult;
  quickbooks?: DailyQuickBooksSyncResult;
};

const toCompanyId = (value: unknown) => {
  if (value instanceof Types.ObjectId) return value.toString();
  return String(value ?? '').trim();
};

const runDailyQuickBooksSync = async ({
  source,
  dryRun = false,
  postDelaySeconds = 120
}: {
  source: string;
  dryRun?: boolean;
  postDelaySeconds?: number;
}): Promise<DailyQuickBooksSyncResult> => {
  // Use native collection query to enumerate tenants for system cron context.
  const docs = await IntegrationSettingsModel.collection
    .find(
      {
        'quickbooks.connected': true
      },
      {
        projection: {
          companyId: 1
        }
      }
    )
    .toArray();

  const companies: DailyQuickBooksCompanyResult[] = [];
  let queued = 0;
  let failed = 0;

  for (const doc of docs) {
    const companyId = toCompanyId((doc as { companyId?: unknown }).companyId);
    if (!companyId) continue;

    if (dryRun) {
      companies.push({
        companyId,
        ok: true
      });
      continue;
    }

    try {
      await markQuickBooksSyncRunning(companyId, 'quickbooks.refresh_reference_data');
      const refresh = await enqueueAccountingJob({
        companyId,
        jobType: 'quickbooks.refresh_reference_data',
        meta: { source, trigger: 'daily-scheduler' }
      });

      await markQuickBooksSyncRunning(companyId, 'quickbooks.post_approved');
      const post = await enqueueAccountingJob({
        companyId,
        jobType: 'quickbooks.post_approved',
        delaySeconds: postDelaySeconds,
        meta: {
          source,
          trigger: 'daily-scheduler',
          waitsFor: 'quickbooks.refresh_reference_data'
        }
      });

      queued += 1;
      companies.push({
        companyId,
        ok: true,
        refreshTaskId: refresh.taskId,
        postTaskId: post.taskId,
        mode: refresh.mode
      });
    } catch (error) {
      failed += 1;
      const message = String((error as Error).message);
      await markQuickBooksSyncFailure(
        companyId,
        'quickbooks.refresh_reference_data',
        message
      );
      await markQuickBooksSyncFailure(companyId, 'quickbooks.post_approved', message);
      companies.push({
        companyId,
        ok: false,
        error: message
      });
    }
  }

  return {
    totalConnected: docs.length,
    queued,
    wouldQueue: dryRun ? docs.length : 0,
    failed,
    companies
  };
};

export const runDailyAccountingSync = async ({
  source,
  dryRun = false,
  includeSheets = true,
  includeQuickBooks = true,
  postDelaySeconds = 120
}: RunDailyAccountingSyncArgs): Promise<RunDailyAccountingSyncResult> => {
  const result: RunDailyAccountingSyncResult = {
    ok: true,
    source,
    dryRun,
    includeSheets,
    includeQuickBooks
  };

  if (includeSheets) {
    result.sheets = await runSheetsSync({
      source: dryRun ? `${source}-sheets-dry-run` : `${source}-sheets`,
      dryRun
    });
    if (!result.sheets.ok) {
      result.ok = false;
    }
  }

  if (includeQuickBooks) {
    result.quickbooks = await runDailyQuickBooksSync({
      source: dryRun ? `${source}-quickbooks-dry-run` : `${source}-quickbooks`,
      dryRun,
      postDelaySeconds
    });
    if (result.quickbooks.failed > 0) {
      result.ok = false;
    }
  }

  return result;
};
