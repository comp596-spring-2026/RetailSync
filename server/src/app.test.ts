import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';

describe('app health', () => {
  it('returns ok status from /health', async () => {
    const app = createApp();
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.data.uptime).toBe('number');
  });
});
