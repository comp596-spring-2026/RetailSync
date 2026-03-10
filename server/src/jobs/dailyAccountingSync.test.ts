import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMock = vi.fn();
const runSheetsSyncMock = vi.fn();
const enqueueAccountingJobMock = vi.fn();
const markQuickBooksSyncRunningMock = vi.fn();
const markQuickBooksSyncFailureMock = vi.fn();

vi.mock('../models/IntegrationSettings', () => ({
  IntegrationSettingsModel: {
    collection: {
      find: (...args: unknown[]) => findMock(...args)
    }
  }
}));

vi.mock('./syncSheets', () => ({
  runSheetsSync: (...args: unknown[]) => runSheetsSyncMock(...args)
}));

vi.mock('./accountingQueue', () => ({
  enqueueAccountingJob: (...args: unknown[]) => enqueueAccountingJobMock(...args)
}));

vi.mock('../services/quickbooksSyncService', () => ({
  markQuickBooksSyncRunning: (...args: unknown[]) => markQuickBooksSyncRunningMock(...args),
  markQuickBooksSyncFailure: (...args: unknown[]) => markQuickBooksSyncFailureMock(...args)
}));

const buildFindCursor = (docs: unknown[]) => ({
  toArray: async () => docs
});

describe('runDailyAccountingSync', () => {
  beforeEach(() => {
    findMock.mockReset();
    runSheetsSyncMock.mockReset();
    enqueueAccountingJobMock.mockReset();
    markQuickBooksSyncRunningMock.mockReset();
    markQuickBooksSyncFailureMock.mockReset();
  });

  it('runs sheets sync and queues refresh/post for connected quickbooks companies', async () => {
    findMock.mockReturnValueOnce(
      buildFindCursor([{ companyId: 'company-1' }, { companyId: 'company-2' }])
    );
    runSheetsSyncMock.mockResolvedValueOnce({
      ok: true,
      lockAcquired: true,
      totalCompanies: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      source: 'accounting-daily-sync-sheets',
      companies: []
    });
    enqueueAccountingJobMock
      .mockResolvedValueOnce({ taskId: 'refresh-1', mode: 'cloud' })
      .mockResolvedValueOnce({ taskId: 'post-1', mode: 'cloud' })
      .mockResolvedValueOnce({ taskId: 'refresh-2', mode: 'cloud' })
      .mockResolvedValueOnce({ taskId: 'post-2', mode: 'cloud' });

    const { runDailyAccountingSync } = await import('./dailyAccountingSync');
    const result = await runDailyAccountingSync({
      source: 'accounting-daily-sync',
      includeSheets: true,
      includeQuickBooks: true,
      dryRun: false,
      postDelaySeconds: 180
    });

    expect(runSheetsSyncMock).toHaveBeenCalledWith({
      source: 'accounting-daily-sync-sheets',
      dryRun: false
    });
    expect(markQuickBooksSyncRunningMock).toHaveBeenCalledTimes(4);
    expect(enqueueAccountingJobMock).toHaveBeenCalledTimes(4);
    expect(result.quickbooks).toEqual(
      expect.objectContaining({
        totalConnected: 2,
        queued: 2,
        failed: 0
      })
    );
    expect(result.ok).toBe(true);
  });

  it('dry run reports wouldQueue and does not enqueue quickbooks jobs', async () => {
    findMock.mockReturnValueOnce(buildFindCursor([{ companyId: 'company-1' }]));
    runSheetsSyncMock.mockResolvedValueOnce({
      ok: true,
      lockAcquired: true,
      totalCompanies: 0,
      succeeded: 0,
      failed: 0,
      skipped: 1,
      source: 'accounting-daily-sync-dry-run-sheets-dry-run',
      companies: []
    });

    const { runDailyAccountingSync } = await import('./dailyAccountingSync');
    const result = await runDailyAccountingSync({
      source: 'accounting-daily-sync-dry-run',
      dryRun: true
    });

    expect(enqueueAccountingJobMock).not.toHaveBeenCalled();
    expect(markQuickBooksSyncRunningMock).not.toHaveBeenCalled();
    expect(result.quickbooks).toEqual(
      expect.objectContaining({
        totalConnected: 1,
        queued: 0,
        wouldQueue: 1,
        failed: 0
      })
    );
  });
});
