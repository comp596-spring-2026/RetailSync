import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const runSheetsSyncMock = vi.fn();

vi.mock('./jobs/syncSheets', () => ({
  runSheetsSync: (...args: unknown[]) => runSheetsSyncMock(...args)
}));

vi.mock('./config/env', () => ({
  env: {
    port: 4000,
    mongoUri: 'mongodb://127.0.0.1:27017/retailsync-test',
    accessSecret: 'test-access-secret',
    refreshSecret: 'test-refresh-secret',
    clientUrl: 'http://localhost:4630',
    nodeEnv: 'test',
    encryptionKey: undefined,
    googleOAuthClientId: undefined,
    googleOAuthClientSecret: undefined,
    googleAuthRedirectUri: undefined,
    googleIntegrationRedirectUri: undefined,
    cronSecret: 'test-secret'
  }
}));

describe('cronRoutes /api/cron/sync-sheets', () => {
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    const module = await import('./app');
    app = module.createApp();
  });

  it('rejects when x-cron-secret is missing or invalid', async () => {
    const res1 = await request(app).post('/api/cron/sync-sheets');
    expect(res1.status).toBe(401);

    const res2 = await request(app)
      .post('/api/cron/sync-sheets')
      .set('x-cron-secret', 'wrong');
    expect(res2.status).toBe(401);
  });

  it('calls runSheetsSync and returns its result when authorized', async () => {
    runSheetsSyncMock.mockResolvedValueOnce({
      ok: true,
      lockAcquired: true,
      totalCompanies: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
      source: 'sheets-cron',
      companies: []
    });

    const res = await request(app)
      .post('/api/cron/sync-sheets')
      .set('x-cron-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(runSheetsSyncMock).toHaveBeenCalledWith({
      source: 'sheets-cron',
      dryRun: false
    });
    expect(res.body).toEqual(
      expect.objectContaining({
        ok: true,
        totalCompanies: 1,
        succeeded: 1
      })
    );
  });

  it('passes dryRun=true to runSheetsSync when query param is set', async () => {
    runSheetsSyncMock.mockResolvedValueOnce({
      ok: true,
      lockAcquired: true,
      totalCompanies: 0,
      succeeded: 0,
      failed: 0,
      skipped: 1,
      source: 'sheets-cron-dry-run',
      companies: []
    });

    const res = await request(app)
      .post('/api/cron/sync-sheets?dryRun=true')
      .set('x-cron-secret', 'test-secret');

    expect(res.status).toBe(200);
    expect(runSheetsSyncMock).toHaveBeenCalledWith({
      source: 'sheets-cron-dry-run',
      dryRun: true
    });
  });
});

