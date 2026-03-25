import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearTestDb,
  connectTestDb,
  disconnectTestDb,
  registerAndCreateCompany,
  setupTestEnv
} from './test/testUtils';
import { RoleModel } from './models/Role';
import { UserModel } from './models/User';

describe('/api/auth/me permissions normalization', () => {
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

  it('returns normalized permissions for a legacy role missing accounting, ledger, and quickbooks', async () => {
    const { accessToken, email } = await registerAndCreateCompany(app, 'AuthMeLegacyRole');
    const user = await UserModel.findOne({ email }).select('_id companyId roleId');

    expect(user?.companyId).toBeTruthy();
    expect(user?.roleId).toBeTruthy();

    await RoleModel.collection.updateOne(
      { _id: user!.roleId! },
      {
        $unset: {
          'permissions.accounting': '',
          'permissions.ledger': '',
          'permissions.quickbooks': ''
        }
      }
    );

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.data.role.permissions.accounting).toBeUndefined();
    expect(response.body.data.permissions.accounting).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    });
    expect(response.body.data.permissions.ledger).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    });
    expect(response.body.data.permissions.quickbooks).toEqual({
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    });
  });
});
