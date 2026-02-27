import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestDb, connectTestDb, disconnectTestDb, registerAndCreateCompany, setupTestEnv } from './test/testUtils';

describe('POS and reports empty-state behavior', () => {
  const TEST_TIMEOUT_MS = 15_000;
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    const module = await import('./app');
    app = module.createApp();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('returns empty array for POS daily when company has no POS data', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'NoPos');
    const start = '2025-01-01';
    const end = '2025-01-31';

    const res = await request(app)
      .get('/api/pos/daily')
      .query({ start, end })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(0);
  }, TEST_TIMEOUT_MS);

  it('returns zeroed totals for monthly summary when company has no POS data', async () => {
    const { accessToken } = await registerAndCreateCompany(app, 'NoReports');
    const month = '2025-03';

    const res = await request(app)
      .get('/api/reports/monthly-summary')
      .query({ month })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.status).toBe('ok');
    const data = res.body.data;
    expect(data).toBeDefined();
    expect(data.month).toBe(month);
    expect(data.days).toBe(0);
    expect(data.sumTotalSales).toBe(0);
    expect(data.sumCreditCard).toBe(0);
    expect(data.sumCash).toBe(0);
    expect(data.sumHighTax).toBe(0);
    expect(data.sumLowTax).toBe(0);
    expect(data.expectedCardDeposit).toBe(0);
    expect(data.expectedCashDeposit).toBe(0);
    expect(data.eftExpected).toBe(0);
  }, TEST_TIMEOUT_MS);
});
