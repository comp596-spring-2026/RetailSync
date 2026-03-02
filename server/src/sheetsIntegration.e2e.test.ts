import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestDb, connectTestDb, disconnectTestDb, registerAndCreateCompany, setupTestEnv } from './test/testUtils';
import { POSDailySummaryModel } from './models/POSDailySummary';

type MockSpreadsheet = {
  title: string;
  tabs: Record<string, { header: string[]; rows: string[][] }>;
};

const mockSheetsData: Record<string, MockSpreadsheet> = {};

const parseTabFromRange = (range?: string) => {
  if (!range) return null;
  const first = range.split('!')[0] ?? '';
  if (!first) return null;
  return first.replace(/^'/, '').replace(/'$/, '');
};

const makeSheetsClient = () => ({
  spreadsheets: {
    get: async ({ spreadsheetId }: { spreadsheetId: string }) => {
      const sheet = mockSheetsData[spreadsheetId];
      if (!sheet) throw new Error('not_found');
      return {
        data: {
          spreadsheetId,
          properties: { title: sheet.title },
          sheets: Object.keys(sheet.tabs).map((tab, idx) => ({
            properties: {
              sheetId: idx + 1,
              title: tab,
              index: idx,
              gridProperties: {
                rowCount: (sheet.tabs[tab]?.rows.length ?? 0) + 1,
                columnCount: sheet.tabs[tab]?.header.length ?? 0
              }
            }
          }))
        }
      };
    },
    values: {
      get: async ({ spreadsheetId, range }: { spreadsheetId: string; range?: string }) => {
        const sheet = mockSheetsData[spreadsheetId];
        if (!sheet) throw new Error('not_found');
        const tabFromRange = parseTabFromRange(range ?? undefined);
        const tab = (tabFromRange && sheet.tabs[tabFromRange]) ? tabFromRange : Object.keys(sheet.tabs)[0];
        if (!tab || !sheet.tabs[tab]) throw new Error('tab_not_found');
        const data = sheet.tabs[tab];
        return {
          data: {
            values: [data.header, ...data.rows]
          }
        };
      }
    }
  }
});

vi.mock('./integrations/google/sheets.client', () => ({
  getSheetsClientForCompany: async () => makeSheetsClient(),
  getDriveClientForServiceAccount: () => ({
    files: {
      list: async () => ({ data: { files: [] } })
    }
  }),
  getDriveClientForCompany: async () => ({
    files: {
      list: async () => ({ data: { files: [] } })
    }
  })
}));

const MAPPING = {
  Date: 'date',
  'High Tax': 'highTax',
  'Low Tax': 'lowTax',
  'Sale Tax': 'saleTax',
  Gas: 'gas',
  'Lottery Sold': 'lottery',
  'Credit Card': 'creditCard',
  'Lottery Payout Cash': 'lotteryPayout',
  'Cash Expenses': 'cashExpenses',
  Notes: 'notes'
} as const;

const MAPPING_WITH_CALCULATED = {
  ...MAPPING,
  Day: 'day',
  'Total Sales': 'totalSales',
  'Cash Diff': 'cash',
  'Credit + Lottery Total': 'clTotal',
  'Cash Payout': 'cashPayout'
} as const;

const MAPPING_WITH_DUPLICATE_TARGET = {
  Date: 'date',
  Day: 'date',
  'High Tax': 'highTax',
  'Low Tax': 'lowTax',
  'Sale Tax': 'saleTax',
  Gas: 'gas',
  'Lottery Sold': 'lottery',
  'Credit Card': 'creditCard',
  'Lottery Payout Cash': 'lotteryPayout',
  'Cash Expenses': 'cashExpenses'
} as const;

describe('Google Sheets integration e2e flows', () => {
  const TEST_TIMEOUT_MS = 20_000;
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    const module = await import('./app');
    app = module.createApp();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    Object.keys(mockSheetsData).forEach((key) => delete mockSheetsData[key]);

    mockSheetsData['sheet-pos'] = {
      title: 'POS Workbook',
      tabs: {
        Daily: {
          header: Object.keys(MAPPING),
          rows: [
            ['2025-01-01', '100', '50', '7.5', '10', '20', '80', '5', '2', 'day1'],
            ['2025-01-02', '120', '40', '8.5', '12', '22', '90', '7', '3', 'day2']
          ]
        }
      }
    };

    mockSheetsData['sheet-eft'] = {
      title: 'EFT Workbook',
      tabs: {
        EFT: {
          header: ['Date', 'Amount'],
          rows: [['2025-01-01', '1200']]
        }
      }
    };

    mockSheetsData['sheet-oauth'] = {
      title: 'OAuth Workbook',
      tabs: {
        Daily: {
          header: Object.keys(MAPPING),
          rows: [
            ['2025-02-01', '90', '30', '6.0', '8', '10', '70', '2', '1', 'oauth1'],
            ['2025-02-02', '95', '35', '6.5', '9', '12', '72', '3', '1', 'oauth2']
          ]
        }
      }
    };

    mockSheetsData['sheet-pos-calculated'] = {
      title: 'POS Calculated Workbook',
      tabs: {
        Daily: {
          header: [
            'Date',
            'Day',
            'High Tax',
            'Low Tax',
            'Sale Tax',
            'Gas',
            'Lottery Sold',
            'Credit Card',
            'Lottery Payout Cash',
            'Cash Expenses',
            'Total Sales',
            'Cash Diff',
            'Credit + Lottery Total',
            'Cash Payout',
            'Notes'
          ],
          rows: [
            ['2025-03-01', 'SatX', '100', '50', '7.5', '10', '20', '80', '5', '2', '999.99', '111.11', '888.88', '12.34', 'mapped-calculated']
          ]
        }
      }
    };
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('supports multi shared-sheet profiles and preserves sync continuity across repeated imports', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsShared');

    await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);

    await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'EFT SHEET',
        spreadsheetId: 'sheet-eft',
        sheetName: 'EFT',
        headerRow: 1,
        enabled: false
      })
      .expect(200);

    // Ensure POS profile stays default after adding additional profiles.
    await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);

    const settingsRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const sharedSheets = settingsRes.body.data.googleSheets.sharedSheets as Array<{ profileId: string; name: string }>;
    expect(sharedSheets.map((entry) => entry.name)).toEqual(expect.arrayContaining(['POS DATA SHEET', 'EFT SHEET']));
    const posProfile = sharedSheets.find((entry) => entry.name === 'POS DATA SHEET');
    expect(posProfile?.profileId).toBeTruthy();

    await request(app)
      .post('/api/integrations/sheets/save-mapping')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileId: posProfile?.profileId,
        columnsMap: MAPPING
      })
      .expect(200);

    await request(app)
      .post('/api/integrations/sheets/verify')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ profileId: posProfile?.profileId })
      .expect(200);

    await request(app)
      .post('/api/pos/import/sheets/preview')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ source: 'service', tab: 'Daily', maxRows: 20 })
      .expect(200);

    const commit1 = await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mapping: {}, transforms: {}, options: {} })
      .expect(200);
    expect(commit1.body.data.result.imported).toBe(2);

    const daily1 = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(daily1.body.data).toHaveLength(2);

    mockSheetsData['sheet-pos'].tabs.Daily.rows = [
      ['2025-01-01', '111', '50', '7.5', '10', '20', '80', '5', '2', 'day1-updated'],
      ['2025-01-02', '120', '40', '8.5', '12', '22', '90', '7', '3', 'day2'],
      ['2025-01-03', '130', '45', '9.0', '13', '24', '95', '8', '3', 'day3']
    ];

    const commit2 = await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mapping: {}, transforms: {}, options: {} })
      .expect(200);
    expect(commit2.body.data.result.imported).toBe(3);

    const daily2 = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(daily2.body.data).toHaveLength(3);
    const firstDay = (daily2.body.data as Array<{ date: string; highTax: number }>).find((row) =>
      String(row.date).startsWith('2025-01-01')
    );
    expect(firstDay?.highTax).toBe(111);

    const settingsAfter = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(settingsAfter.body.data.lastImportSource).toBe('google_sheets');
    expect(settingsAfter.body.data.lastImportAt).toBeTruthy();
  }, TEST_TIMEOUT_MS);

  it('supports oauth sheet import workflow with explicit spreadsheet override and mapped commit', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsOauth');

    await request(app)
      .put('/api/settings/google-sheets/mode')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mode: 'oauth' })
      .expect(200);

    await request(app)
      .put('/api/settings/google-sheets/source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'OAuth POS',
        spreadsheetId: 'sheet-oauth',
        range: 'Daily!A1:Z',
        mapping: MAPPING,
        active: true
      })
      .expect(200);

    const preview = await request(app)
      .post('/api/pos/import/sheets/preview')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        source: 'oauth',
        spreadsheetId: 'sheet-oauth',
        tab: 'Daily',
        headerRow: 1,
        maxRows: 20
      })
      .expect(200);
    expect(preview.body.data.header).toEqual(expect.arrayContaining(['Date', 'High Tax']));

    const validation = await request(app)
      .post('/api/pos/import/sheets/match')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapping: MAPPING,
        transforms: {},
        validateSample: true,
        spreadsheetId: 'sheet-oauth',
        tab: 'Daily',
        headerRow: 1
      })
      .expect(200);
    expect(validation.body.data.valid).toBe(true);

    const commit = await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapping: MAPPING,
        transforms: {},
        options: { spreadsheetId: 'sheet-oauth', tab: 'Daily', headerRow: 1 }
      })
      .expect(200);
    expect(commit.body.data.result.imported).toBe(2);

    const daily = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-02-01', end: '2025-02-28' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(daily.body.data).toHaveLength(2);
  }, TEST_TIMEOUT_MS);

  it('runs cron sync against default shared profile and imports mapped rows', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsCron');

    const configRes = await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);
    const profileId = configRes.body.data.activeProfile.profileId as string;

    await request(app)
      .post('/api/integrations/sheets/save-mapping')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileId,
        columnsMap: MAPPING
      })
      .expect(200);

    const cron = await request(app)
      .post('/api/cron/sync-sheets')
      .set('x-cron-secret', process.env.CRON_SECRET ?? '')
      .expect(200);
    expect(cron.body.ok).toBe(true);
    expect(cron.body.succeeded).toBeGreaterThanOrEqual(1);

    const daily = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(daily.body.data).toHaveLength(2);
  }, TEST_TIMEOUT_MS);

  it('uses directly mapped calculated fields when provided', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsCalculatedDirect');

    const configRes = await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos-calculated',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);
    const profileId = configRes.body.data.activeProfile.profileId as string;

    await request(app)
      .post('/api/integrations/sheets/save-mapping')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileId,
        columnsMap: MAPPING_WITH_CALCULATED
      })
      .expect(200);

    await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapping: {},
        transforms: {},
        options: { mode: 'service_account', profileId, profileName: 'POS DATA SHEET' }
      })
      .expect(200);

    const daily = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-03-01', end: '2025-03-01' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(daily.body.data).toHaveLength(1);
    const row = daily.body.data[0] as {
      day: string;
      totalSales: number;
      cash: number;
      clTotal: number;
      cashPayout: number;
    };
    expect(row.day).toBe('SatX');
    expect(row.totalSales).toBe(999.99);
    expect(row.cash).toBe(111.11);
    expect(row.clTotal).toBe(888.88);
    expect(row.cashPayout).toBe(12.34);
  }, TEST_TIMEOUT_MS);

  it('rejects duplicate target mapping and enforces one-to-one mapping', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsDuplicateMapping');

    const configRes = await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);
    const profileId = configRes.body.data.activeProfile.profileId as string;

    const save = await request(app)
      .post('/api/integrations/sheets/save-mapping')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileId,
        columnsMap: MAPPING_WITH_DUPLICATE_TARGET
      })
      .expect(400);

    expect(String(save.body.message ?? '')).toContain('One-to-one mapping required');
  }, TEST_TIMEOUT_MS);

  it('hard reset clears all Google Sheets configuration and deletes all Google Sheets data', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsDeleteOAuth');

    await request(app)
      .put('/api/settings/google-sheets/mode')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mode: 'oauth' })
      .expect(200);

    const posSource = await request(app)
      .put('/api/settings/google-sheets/source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'POS DATA SHEET',
        spreadsheetId: 'sheet-oauth',
        range: 'Daily!A1:Z',
        mapping: MAPPING,
        active: true
      })
      .expect(200);
    const posSourceId = posSource.body.data.googleSheets.sources.find((source: any) => source.name === 'POS DATA SHEET')?.sourceId;

    await request(app)
      .put('/api/settings/google-sheets/source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'EFT SHEET',
        spreadsheetId: 'sheet-pos',
        range: 'Daily!A1:Z',
        mapping: MAPPING,
        active: false
      })
      .expect(200);

    await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapping: {},
        transforms: {},
        options: {
          mode: 'oauth',
          profileName: 'POS DATA SHEET',
          sourceId: posSourceId,
          spreadsheetId: 'sheet-oauth',
          tab: 'Daily',
          headerRow: 1
        }
      })
      .expect(200);

    await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapping: {},
        transforms: {},
        options: {
          mode: 'oauth',
          profileName: 'EFT SHEET',
          spreadsheetId: 'sheet-pos',
          tab: 'Daily',
          headerRow: 1
        }
      })
      .expect(200);

    const beforeDelete = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-02-28' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(beforeDelete.body.data).toHaveLength(4);

    const hardDelete = await request(app)
      .post('/api/integrations/sheets/delete-source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'oauth',
        profileName: 'POS DATA SHEET',
        deleteType: 'hard',
        confirmText: 'HARD RESET'
      })
      .expect(200);
    expect(hardDelete.body.data.deletedRows).toBe(4);

    const settingsAfter = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const remainingSources = settingsAfter.body.data.googleSheets.sources as Array<{ name: string }>;
    expect(remainingSources).toHaveLength(0);
    expect(settingsAfter.body.data.googleSheets.connected).toBe(false);
    const sharedSheetsAfter = settingsAfter.body.data.googleSheets.sharedSheets as Array<{ enabled: boolean; spreadsheetId: string | null }>;
    expect(sharedSheetsAfter.every((entry) => entry.enabled === false && entry.spreadsheetId === null)).toBe(true);

    const afterDelete = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-02-28' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterDelete.body.data).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('soft reset clears all Google Sheets config but keeps imported data', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsSoftDelete');

    const configRes = await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);
    const profileId = configRes.body.data.activeProfile.profileId as string;

    await request(app)
      .post('/api/integrations/sheets/save-mapping')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileId,
        columnsMap: MAPPING
      })
      .expect(200);

    await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mapping: {}, transforms: {}, options: { mode: 'service_account', profileId, profileName: 'POS DATA SHEET' } })
      .expect(200);

    const beforeDelete = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(beforeDelete.body.data).toHaveLength(2);

    const softDelete = await request(app)
      .post('/api/integrations/sheets/delete-source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileId,
        profileName: 'POS DATA SHEET',
        deleteType: 'soft',
        confirmText: 'SOFT RESET'
      })
      .expect(200);
    expect(softDelete.body.data.deletedRows).toBe(0);

    const settingsAfter = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const posProfile = (settingsAfter.body.data.googleSheets.sharedSheets as Array<any>).find(
      (sheet) => sheet.name === 'POS DATA SHEET'
    );
    expect(posProfile.spreadsheetId).toBeNull();
    expect(posProfile.enabled).toBe(false);
    expect(posProfile.lastMapping?.columnsMap ?? {}).toEqual({});
    expect(settingsAfter.body.data.googleSheets.sources).toHaveLength(0);
    expect(settingsAfter.body.data.googleSheets.connected).toBe(false);

    const afterDelete = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterDelete.body.data).toHaveLength(2);
  }, TEST_TIMEOUT_MS);

  it('hard reset also purges legacy google_sheets rows without binding key', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsLegacyHardDelete');

    await request(app)
      .put('/api/settings/google-sheets/mode')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ mode: 'oauth' })
      .expect(200);

    await request(app)
      .put('/api/settings/google-sheets/source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'POS DATA SHEET',
        spreadsheetId: 'sheet-oauth',
        range: 'Daily!A1:Z',
        mapping: MAPPING,
        active: true
      })
      .expect(200);

    const settingsBefore = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const companyId = settingsBefore.body.data.companyId as string;

    await POSDailySummaryModel.create({
      companyId,
      date: new Date('2026-01-13T00:00:00.000Z'),
      day: 'Tue',
      highTax: 100,
      lowTax: 50,
      saleTax: 10,
      totalSales: 150,
      gas: 20,
      lottery: 15,
      creditCard: 120,
      lotteryPayout: 2,
      clTotal: 135,
      cash: 30,
      cashPayout: 2,
      cashExpenses: 1,
      notes: 'legacy',
      source: 'google_sheets',
      importBindingKey: null
    });

    const deleted = await request(app)
      .post('/api/integrations/sheets/delete-source')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'oauth',
        profileName: 'POS DATA SHEET',
        deleteType: 'hard',
        confirmText: 'HARD RESET'
      })
      .expect(200);
    expect(deleted.body.data.deletedRows).toBeGreaterThanOrEqual(1);

    const remaining = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2026-01-13', end: '2026-01-13' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(remaining.body.data).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('stores source linkage metadata on imported rows and supports clear POS data endpoint', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'SheetsClearPos');

    await request(app)
      .post('/api/integrations/sheets/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-pos',
        sheetName: 'Daily',
        headerRow: 1,
        enabled: true
      })
      .expect(200);

    await request(app)
      .post('/api/integrations/sheets/save-mapping')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mode: 'service_account',
        profileName: 'POS DATA SHEET',
        columnsMap: MAPPING
      })
      .expect(200);

    await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        mapping: {},
        transforms: {},
        options: {
          mode: 'service_account',
          profileName: 'POS DATA SHEET',
          tab: 'Daily',
          headerRow: 1
        }
      })
      .expect(200);

    const daily = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(daily.body.data).toHaveLength(2);
    const first = daily.body.data[0] as { source?: string; sourceRef?: Record<string, unknown> };
    expect(first.source).toBe('google_sheets');
    expect(first.sourceRef?.profileName).toBe('POS DATA SHEET');
    expect(first.sourceRef?.reason).toBe('Mapped sheet import');

    const cleared = await request(app)
      .post('/api/pos/clear')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        scope: 'all',
        confirmText: 'CLEAR POS DATA'
      })
      .expect(200);
    expect(cleared.body.data.deletedCount).toBeGreaterThanOrEqual(2);

    const afterClear = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(afterClear.body.data).toHaveLength(0);
  }, TEST_TIMEOUT_MS);
});
