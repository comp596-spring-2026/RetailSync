import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearTestDb,
  connectTestDb,
  disconnectTestDb,
  registerAndCreateCompany,
  setupTestEnv
} from './test/testUtils';

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
        const tab = tabFromRange && sheet.tabs[tabFromRange] ? tabFromRange : Object.keys(sheet.tabs)[0];
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
  }),
  getOAuthClientForCompany: async () => ({
    credentials: {
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      expiry_date: Date.now() + 60_000
    }
  })
}));

const POS_MAPPING = {
  Date: 'date',
  HighTax: 'highTax',
  LowTax: 'lowTax',
  SaleTax: 'saleTax',
  Gas: 'gas',
  Lottery: 'lottery',
  CreditCard: 'creditCard',
  LotteryPayout: 'lotteryPayout',
  CashExpenses: 'cashExpenses'
} as const;

describe('Google Sheets integration e2e (connector architecture)', () => {
  const TEST_TIMEOUT_MS = 20_000;
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    process.env.CRON_SECRET = process.env.CRON_SECRET ?? 'test-cron-secret';
    const module = await import('./app');
    app = module.createApp();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    Object.keys(mockSheetsData).forEach((key) => delete mockSheetsData[key]);

    mockSheetsData['sheet-oauth-pos'] = {
      title: 'OAuth POS',
      tabs: {
        Daily: {
          header: Object.keys(POS_MAPPING),
          rows: [
            ['2025-01-01', '100', '50', '7.5', '10', '20', '80', '5', '2'],
            ['2025-01-02', '120', '40', '8.0', '11', '22', '90', '7', '1']
          ]
        }
      }
    };

    mockSheetsData['sheet-oauth-inventory'] = {
      title: 'OAuth Inventory',
      tabs: {
        Items: {
          header: ['SKU', 'Description', 'Qty'],
          rows: [['ABC-1', 'Sample Item', '10']]
        }
      }
    };

    mockSheetsData['sheet-shared-pos'] = {
      title: 'Shared POS',
      tabs: {
        Daily: {
          header: Object.keys(POS_MAPPING),
          rows: [['2025-01-03', '110', '44', '8.2', '12', '18', '95', '4', '3']]
        }
      }
    };
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('creates oauth source, supports second connector, activates pos_daily, imports, and keeps connector state isolated', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'ConnectorOAuth');

    const createSource = await request(app)
      .post('/api/settings/google-sheets/oauth/sources')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'OAuth Primary',
        connectors: [
          {
            key: 'pos_daily',
            label: 'POS Daily Summary',
            enabled: true,
            spreadsheetId: 'sheet-oauth-pos',
            sheetName: 'Daily',
            headerRow: 1,
            mapping: POS_MAPPING
          }
        ]
      })
      .expect(200);

    const sourceId = createSource.body.data.source.id as string;

    await request(app)
      .put(`/api/settings/google-sheets/oauth/sources/${sourceId}/connectors/inventory_items`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        label: 'Inventory Items',
        enabled: true,
        spreadsheetId: 'sheet-oauth-inventory',
        sheetName: 'Items',
        headerRow: 1,
        mapping: {
          SKU: 'sku',
          Description: 'description'
        }
      })
      .expect(200);

    await request(app)
      .post('/api/settings/google-sheets/activate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        integrationType: 'oauth',
        sourceId,
        connectorKey: 'pos_daily'
      })
      .expect(200);

    const commit = await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ connectorKey: 'pos_daily' })
      .expect(200);

    expect(commit.body.data.result.imported).toBe(2);
    expect(commit.body.data.result.connectorKey).toBe('pos_daily');

    await request(app)
      .post('/api/integrations/google-sheets/oauth/debug')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ sourceId, connectorKey: 'inventory_items' })
      .expect(200);

    const settings = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const oauth = settings.body.data.googleSheets.oauth as {
      activeConnectorKey: string;
      sources: Array<{
        id: string;
        connectors: Array<{ key: string; lastDebugResult: { ok: boolean } | null; lastImportAt: string | null }>;
      }>;
    };

    expect(oauth.activeConnectorKey).toBe('pos_daily');
    const source = oauth.sources.find((entry) => entry.id === sourceId);
    expect(source).toBeTruthy();
    const posConnector = source?.connectors.find((entry) => entry.key === 'pos_daily');
    const inventoryConnector = source?.connectors.find((entry) => entry.key === 'inventory_items');
    expect(posConnector?.lastImportAt).toBeTruthy();
    expect(inventoryConnector?.lastDebugResult?.ok).toBe(true);

    const daily = await request(app)
      .get('/api/pos/daily')
      .query({ start: '2025-01-01', end: '2025-01-31' })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(daily.body.data).toHaveLength(2);
  }, TEST_TIMEOUT_MS);

  it('activates shared connector, debugs per-connector, and cron sync imports using active shared connector only', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'ConnectorShared');

    const createProfile = await request(app)
      .post('/api/settings/google-sheets/shared/profiles')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Shared Primary',
        connectors: [
          {
            key: 'pos_daily',
            label: 'POS Daily Summary',
            enabled: true,
            spreadsheetId: 'sheet-shared-pos',
            sheetName: 'Daily',
            headerRow: 1,
            mapping: POS_MAPPING,
            schedule: {
              enabled: false,
              frequency: 'manual'
            }
          }
        ]
      })
      .expect(200);

    const profileId = createProfile.body.data.profile.id as string;

    await request(app)
      .post('/api/settings/google-sheets/activate')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        integrationType: 'shared',
        profileId,
        connectorKey: 'pos_daily'
      })
      .expect(200);

    await request(app)
      .post('/api/integrations/google-sheets/shared/debug')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ profileId, connectorKey: 'pos_daily' })
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

    expect(daily.body.data).toHaveLength(1);
    expect(String(daily.body.data[0].date)).toContain('2025-01-03');

    const settings = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const shared = settings.body.data.googleSheets.shared as {
      activeProfileId: string;
      activeConnectorKey: string;
      lastScheduledSyncAt: string | null;
      profiles: Array<{
        id: string;
        connectors: Array<{ key: string; lastDebugResult: { ok: boolean } | null; lastImportAt: string | null }>;
      }>;
    };

    expect(shared.activeProfileId).toBe(profileId);
    expect(shared.activeConnectorKey).toBe('pos_daily');
    expect(shared.lastScheduledSyncAt).toBeTruthy();
    const profile = shared.profiles.find((entry) => entry.id === profileId);
    const connector = profile?.connectors.find((entry) => entry.key === 'pos_daily');
    expect(connector?.lastDebugResult?.ok).toBe(true);
    expect(connector?.lastImportAt).toBeTruthy();
  }, TEST_TIMEOUT_MS);

  it('stages and commits connector-native sheet settings, then resolves committed config for import', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'ConnectorStageCommit');

    const staged = await request(app)
      .post('/api/settings/google-sheets/stage-change')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        connectorKey: 'pos_daily',
        sourceType: 'shared',
        spreadsheetId: 'sheet-shared-pos',
        sheetName: 'Daily',
        headerRow: 1,
        mapping: POS_MAPPING
      })
      .expect(200);

    expect(staged.body.data.connectorKey).toBe('pos_daily');
    expect(staged.body.data.sourceType).toBe('shared');
    expect(staged.body.data.preview.header).toEqual(Object.keys(POS_MAPPING));
    expect(staged.body.data.compatibility.status).toBe('compatible');

    const committed = await request(app)
      .post('/api/settings/google-sheets/commit-change')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        connectorKey: 'pos_daily',
        sourceType: 'shared',
        profileName: 'POS DATA SHEET',
        spreadsheetId: 'sheet-shared-pos',
        tab: 'Daily',
        headerRow: 1,
        mapping: POS_MAPPING,
        activate: true
      })
      .expect(200);

    expect(committed.body.data.ok).toBe(true);
    expect(committed.body.data.sourceType).toBe('shared');
    expect(committed.body.data.activeIntegration).toBe('shared');
    expect(committed.body.data.activeConnectorKey).toBe('pos_daily');
    expect(committed.body.data.activeProfileId).toBeTruthy();

    const commitImport = await request(app)
      .post('/api/pos/import/sheets/commit')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ connectorKey: 'pos_daily' })
      .expect(200);

    expect(commitImport.body.data.result.imported).toBe(1);
    expect(commitImport.body.data.result.connectorKey).toBe('pos_daily');

    const settings = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const shared = settings.body.data.googleSheets.shared as {
      profiles: Array<{
        connectors: Array<{ key: string; spreadsheetId: string; sheetName: string; mapping: Record<string, string> }>;
      }>;
    };

    const committedConnector = shared.profiles
      .flatMap((profile) => profile.connectors)
      .find((connector) => connector.key === 'pos_daily');

    expect(committedConnector).toBeTruthy();
    expect(committedConnector?.spreadsheetId).toBe('sheet-shared-pos');
    expect(committedConnector?.sheetName).toBe('Daily');
    expect(committedConnector?.mapping.Date).toBe('date');
  }, TEST_TIMEOUT_MS);
});
