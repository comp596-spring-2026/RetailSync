import { beforeEach, describe, expect, it, vi } from 'vitest';

const findSettingsMock = vi.fn();
const findOneAndUpdateSettingsMock = vi.fn();
const findOneLockMock = vi.fn();
const updateOneLockMock = vi.fn();
const readSharedSheetRowsMock = vi.fn();
const parseRowsWithHeaderRowMock = vi.fn();
const importRowsForCompanyMock = vi.fn();

vi.mock('../models/IntegrationSettings', () => ({
  IntegrationSettingsModel: {
    find: (...args: unknown[]) => ({
      lean: () => findSettingsMock(...args)
    }),
    findOneAndUpdate: (...args: unknown[]) => ({
      lean: () => findOneAndUpdateSettingsMock(...args)
    })
  }
}));

vi.mock('../models/JobLock', () => ({
  JobLockModel: {
    findOne: (...args: unknown[]) => ({
      lean: () => findOneLockMock(...args)
    }),
    updateOne: (...args: unknown[]) => updateOneLockMock(...args)
  }
}));

vi.mock('../controllers/posController', () => ({
  readSharedSheetRows: (...args: unknown[]) => readSharedSheetRowsMock(...args),
  parseRowsWithHeaderRow: (...args: unknown[]) => parseRowsWithHeaderRowMock(...args),
  importRowsForCompany: (...args: unknown[]) => importRowsForCompanyMock(...args)
}));

describe('runSheetsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: no active lock
    findOneLockMock.mockResolvedValue(null);
    updateOneLockMock.mockResolvedValue(undefined);
  });

  it('skips when lock is active', async () => {
    const { runSheetsSync } = await import('./syncSheets');

    // simulate existing non-expired lock
    findOneLockMock.mockResolvedValue({
      key: 'sheets-sync',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    });

    const result = await runSheetsSync({ source: 'test-lock' });

    expect(result.lockAcquired).toBe(false);
    expect(result.totalCompanies).toBe(0);
    expect(findSettingsMock).not.toHaveBeenCalled();
  });

  it('returns skipped when no companies have sheets configured', async () => {
    const { runSheetsSync } = await import('./syncSheets');

    findSettingsMock.mockResolvedValueOnce([]);

    const result = await runSheetsSync({ source: 'test-none' });

    expect(result.lockAcquired).toBe(true);
    expect(result.totalCompanies).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.companies[0]).toEqual(
      expect.objectContaining({
        companyId: 'none',
        skipped: true,
        reason: 'Sheets not configured for any company'
      })
    );
  });

  it('performs a dry-run without writing to DB', async () => {
    const { runSheetsSync } = await import('./syncSheets');

    findSettingsMock.mockResolvedValueOnce([
      {
        companyId: 'company-1',
        googleSheets: {
          sharedConfig: {
            spreadsheetId: 'sheet-1',
            sheetName: 'Sheet1',
            headerRow: 1,
            enabled: true
          }
        }
      }
    ]);

    readSharedSheetRowsMock.mockResolvedValueOnce({
      source: { spreadsheetId: 'sheet-1', sheetName: 'Sheet1', headerRow: 1 },
      rawRows: [
        ['Date', 'Total'],
        ['2024-01-01', '100']
      ],
      rowCount: 2
    });

    parseRowsWithHeaderRowMock.mockReturnValueOnce([
      { Date: '2024-01-01', Total: '100' }
    ]);

    const result = await runSheetsSync({ source: 'dry-run', dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(importRowsForCompanyMock).not.toHaveBeenCalled();
    expect(findOneAndUpdateSettingsMock).not.toHaveBeenCalled();

    const companyResult = result.companies[0];
    expect(companyResult.companyId).toBe('company-1');
    expect(companyResult.skipped).toBe(true);
    expect(companyResult.reason).toBe('dryRun');
    expect(companyResult.importedCount).toBe(1);
  });

  it('imports rows and updates IntegrationSettings on success', async () => {
    const { runSheetsSync } = await import('./syncSheets');

    const now = new Date();

    findSettingsMock.mockResolvedValueOnce([
      {
        companyId: 'company-1',
        googleSheets: {
          sharedConfig: {
            spreadsheetId: 'sheet-1',
            sheetName: 'Sheet1',
            headerRow: 1,
            enabled: true
          }
        }
      }
    ]);

    readSharedSheetRowsMock.mockResolvedValueOnce({
      source: { spreadsheetId: 'sheet-1', sheetName: 'Sheet1', headerRow: 1 },
      rawRows: [
        ['Date', 'Total'],
        ['2024-01-01', '100']
      ],
      rowCount: 2
    });

    parseRowsWithHeaderRowMock.mockReturnValueOnce([
      { Date: '2024-01-01', Total: '100' }
    ]);

    importRowsForCompanyMock.mockResolvedValueOnce({
      ok: true as const,
      data: {
        imported: 1,
        upserted: 1,
        modified: 0
      }
    });

    findOneAndUpdateSettingsMock.mockResolvedValueOnce({
      lastImportAt: now
    });

    const result = await runSheetsSync({ source: 'sheets-cron' });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);

    const companyResult = result.companies[0];
    expect(companyResult.ok).toBe(true);
    expect(companyResult.importedCount).toBe(1);
    expect(companyResult.upsertedCount).toBe(1);
    expect(companyResult.modifiedCount).toBe(0);
    expect(companyResult.lastImportAt).toEqual(now);

    expect(importRowsForCompanyMock).toHaveBeenCalledWith(
      'company-1',
      expect.any(Array),
      'google_sheets'
    );
    expect(findOneAndUpdateSettingsMock).toHaveBeenCalledWith(
      { companyId: 'company-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          lastImportSource: 'google_sheets'
        })
      }),
      expect.any(Object)
    );
  });
});

