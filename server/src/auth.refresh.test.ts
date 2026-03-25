import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { moduleKeys } from '@retailsync/shared';
import { Types } from 'mongoose';
import {
  createGoogleAuthSession,
  clearTestDb,
  connectTestDb,
  disconnectTestDb,
  setupTestEnv
} from './test/testUtils';
import { CompanyModel } from './models/Company';
import { RoleModel } from './models/Role';
import { UserModel } from './models/User';
import { memberPermissions } from './utils/defaultPermissions';
import { signAccessToken } from './utils/jwt';

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
    const session = await createGoogleAuthSession('Rotate');
    const firstCookie = session.refreshCookie;
    expect(firstCookie).toBeDefined();

    const refreshRes = await request(app).post('/api/auth/refresh').set('Cookie', firstCookie).expect(200);
    const secondCookie = refreshRes.headers['set-cookie']?.[0];
    expect(secondCookie).toBeDefined();

    await request(app).post('/api/auth/refresh').set('Cookie', firstCookie).expect(401);
  });

  it('revokes refresh token on logout', async () => {
    const session = await createGoogleAuthSession('Logout');
    const cookie = session.refreshCookie;
    expect(cookie).toBeDefined();

    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('returns normalized current module keys from /auth/me for legacy roles', async () => {
    const companyId = new Types.ObjectId();
    const roleId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const legacyPermissions = memberPermissions() as Record<string, unknown>;
    delete legacyPermissions.accounting;
    delete legacyPermissions.ledger;
    delete legacyPermissions.quickbooks;

    await CompanyModel.create({
      _id: companyId,
      name: 'Legacy Co',
      code: 'LEG',
      businessType: 'Retail',
      address: '1 Main St',
      phone: '555-1111',
      email: 'legacy@example.com',
      timezone: 'America/New_York',
      currency: 'USD'
    });

    await RoleModel.collection.insertOne({
      _id: roleId,
      companyId,
      name: 'Member',
      isSystem: true,
      permissions: legacyPermissions,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await UserModel.create({
      _id: userId,
      firstName: 'Legacy',
      lastName: 'Member',
      email: 'legacy.member@example.com',
      googleId: 'legacy-google',
      passwordHash: 'hash',
      emailVerifiedAt: new Date(),
      companyId,
      roleId
    });

    const accessToken = signAccessToken({
      sub: userId.toString(),
      email: 'legacy.member@example.com',
      companyId: companyId.toString(),
      roleId: roleId.toString()
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Object.keys(response.body.data.permissions).sort()).toEqual([...moduleKeys].sort());
    expect(response.body.data.permissions.accounting).toEqual(memberPermissions().accounting);
    expect(response.body.data.permissions.ledger).toEqual(memberPermissions().ledger);
    expect(response.body.data.permissions.quickbooks).toEqual(memberPermissions().quickbooks);
  });
});
