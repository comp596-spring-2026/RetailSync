import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { setupTestEnv } from './test/testUtils';

describe('app health', () => {
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    const module = await import('./app');
    app = module.createApp();
  });

  it('returns ok status from /health', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
  });
});
