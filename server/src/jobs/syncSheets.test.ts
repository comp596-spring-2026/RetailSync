import { beforeEach, describe, expect, it, vi } from 'vitest';

const findSettingsMock = vi.fn();
const updateOneSettingsMock = vi.fn();
const findOneLockMock = vi.fn();
const updateOneLockMock = vi.fn();
const readSharedSheetRowsMock = vi.fn();
const parseRowsWithHeaderRowMock = vi.fn();
const importEvaluatedRowsForCompanyMock = vi.fn();
const markConnectorImportedMock = vi.fn();

vi.mock('../models/IntegrationSettings', () => ({
  IntegrationSettingsModel: {
    find: (...args: unknown[]) => ({
      lean: () => findSettingsMock(...args)
    }),
    updateOne: (...args: unknown[]) => updateOneSettingsMock(...args)
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
  importEvaluatedRowsForCompany: (...args: unknown[]) => importEvaluatedRowsForCompanyMock(...args)
}));

vi.mock('../controllers/googleSheetsController', () => ({
  markConnectorImported: (...args: unknown[]) => markConnectorImportedMock(...args)
}));

describe('runSheetsSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: no active lock
    findOneLockMock.mockResolvedValue(null);
    updateOneLockMock.mockResolvedValue(undefined);
    updateOneSettingsMock.mockResolvedValue(undefined);
    markConnectorImportedMock.mockResolvedValue(undefined);
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
          activeIntegration: 'shared',
          shared: {
            enabled: true,
            activeProfileId: 'profile-1',
            activeConnectorKey: 'pos_daily',
            lastScheduledSyncAt: null,
            profiles: [
              {
                _id: 'profile-1',
                connectors: [
                  {
                    key: 'pos_daily',
                    enabled: true,
                    schedule: { enabled: false }
                  }
                ]
              }
            ]
          }
        }
      }
    ]);

    readSharedSheetRowsMock.mockResolvedValueOnce({
      source: {
        spreadsheetId: 'sheet-1',
        sheetName: 'Sheet1',
        profileName: 'POS Daily',
        headerRow: 1,
        mapping: {
          Date: 'date',
          highTax: 'highTax',
          lowTax: 'lowTax',
          saleTax: 'saleTax',
          gas: 'gas',
          lottery: 'lottery',
          creditCard: 'creditCard',
          lotteryPayout: 'lotteryPayout',
          cashExpenses: 'cashExpenses'
        }
      },
      rawRows: [
        [
          'Date',
          'highTax',
          'lowTax',
          'saleTax',
          'gas',
          'lottery',
          'creditCard',
          'lotteryPayout',
          'cashExpenses'
        ],
        ['2024-01-01', '100', '50', '10', '20', '10', '140', '2', '1']
      ],
      rowCount: 2
    });

    parseRowsWithHeaderRowMock.mockReturnValueOnce([
      {
        Date: '2024-01-01',
        highTax: '100',
        lowTax: '50',
        saleTax: '10',
        gas: '20',
        lottery: '10',
        creditCard: '140',
        lotteryPayout: '2',
        cashExpenses: '1'
      }
    ]);

    const result = await runSheetsSync({ source: 'dry-run', dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.succeeded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(importEvaluatedRowsForCompanyMock).not.toHaveBeenCalled();
    expect(updateOneSettingsMock).not.toHaveBeenCalled();

    const companyResult = result.companies[0];
    expect(companyResult.companyId).toBe('company-1');
    expect(companyResult.skipped).toBe(true);
    expect(companyResult.reason).toBe('dryRun');
    expect(companyResult.importedCount).toBe(1);
  });

  it('imports rows and updates IntegrationSettings on success', async () => {
    const { runSheetsSync } = await import('./syncSheets');

    findSettingsMock.mockResolvedValueOnce([
      {
        companyId: 'company-1',
        googleSheets: {
          activeIntegration: 'shared',
          shared: {
            enabled: true,
            activeProfileId: 'profile-1',
            activeConnectorKey: 'pos_daily',
            lastScheduledSyncAt: null,
            profiles: [
              {
                _id: 'profile-1',
                connectors: [
                  {
                    key: 'pos_daily',
                    enabled: true,
                    schedule: { enabled: false }
                  }
                ]
              }
            ]
          }
        }
      }
    ]);

    readSharedSheetRowsMock.mockResolvedValueOnce({
      source: {
        spreadsheetId: 'sheet-1',
        sheetName: 'Sheet1',
        profileName: 'POS Daily',
        headerRow: 1,
        mapping: {
          Date: 'date',
          highTax: 'highTax',
          lowTax: 'lowTax',
          saleTax: 'saleTax',
          gas: 'gas',
          lottery: 'lottery',
          creditCard: 'creditCard',
          lotteryPayout: 'lotteryPayout',
          cashExpenses: 'cashExpenses'
        }
      },
      rawRows: [
        [
          'Date',
          'highTax',
          'lowTax',
          'saleTax',
          'gas',
          'lottery',
          'creditCard',
          'lotteryPayout',
          'cashExpenses'
        ],
        ['2024-01-01', '100', '50', '10', '20', '10', '140', '2', '1']
      ],
      rowCount: 2
    });

    parseRowsWithHeaderRowMock.mockReturnValueOnce([
      {
        Date: '2024-01-01',
        highTax: '100',
        lowTax: '50',
        saleTax: '10',
        gas: '20',
        lottery: '10',
        creditCard: '140',
        lotteryPayout: '2',
        cashExpenses: '1'
      }
    ]);

    importEvaluatedRowsForCompanyMock.mockResolvedValueOnce({
      ok: true as const,
      data: {
        imported: 1,
        upserted: 1,
        modified: 0
      }
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
    expect(companyResult.lastImportAt).toBeTruthy();

    expect(importEvaluatedRowsForCompanyMock).toHaveBeenCalledWith(
      'company-1',
      expect.any(Array),
      'google_sheets',
      expect.objectContaining({
        importBindingKey: expect.any(String)
      })
    );
    expect(markConnectorImportedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        integrationType: 'shared',
        profileId: 'profile-1',
        connectorKey: 'pos_daily'
      })
    );
    expect(updateOneSettingsMock).toHaveBeenCalledWith(
      { companyId: 'company-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          'googleSheets.shared.lastScheduledSyncAt': expect.any(Date)
        })
      })
    );
  });
});
