import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearTestDb,
  connectTestDb,
  disconnectTestDb,
  registerVerifyAndLogin,
  setupTestEnv
} from './test/testUtils';

describe('auth refresh rotation', () => {
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

  it('rejects reuse of old refresh token after rotation', async () => {
    const { loginRes } = await registerVerifyAndLogin(app, 'Rotate');
    const firstCookie = loginRes.headers['set-cookie']?.[0];
    expect(firstCookie).toBeDefined();

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie).expect(200);
    const secondCookie = refreshRes.headers['set-cookie']?.[0];
    expect(secondCookie).toBeDefined();

    await request(app).post('/api/auth/refresh').set('Cookie', firstCookie).expect(401);
  });

  it('revokes refresh token on logout', async () => {
    const { loginRes } = await registerVerifyAndLogin(app, 'Logout');
    const cookie = loginRes.headers['set-cookie']?.[0];
    expect(cookie).toBeDefined();

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
