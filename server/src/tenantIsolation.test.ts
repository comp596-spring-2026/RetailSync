import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearTestDb, connectTestDb, disconnectTestDb, registerAndCreateCompany, setupTestEnv } from './test/testUtils';

describe('tenant isolation', () => {
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
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('prevents cross-tenant reads and writes for items', async () => {
    const a = await registerAndCreateCompany(app, 'A');
    const b = await registerAndCreateCompany(app, 'B');

    const createA = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ upc: '111', modifier: '', description: 'Item A', department: 'grocery', price: 5.5 })
      .expect(201);

    const createB = await request(app)
      .post('/api/items')
      .set('Authorization', `Bearer ${b.accessToken}`)
      .send({ upc: '222', modifier: '', description: 'Item B', department: 'grocery', price: 7.5 })
      .expect(201);

    const listA = await request(app).get('/api/items').set('Authorization', `Bearer ${a.accessToken}`).expect(200);

    expect(listA.body.data).toHaveLength(1);
    expect(listA.body.data[0]._id).toBe(createA.body.data._id);

    await request(app)
      .put(`/api/items/${createB.body.data._id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .send({ description: 'Illegal update' })
      .expect(404);

    await request(app)
      .delete(`/api/items/${createB.body.data._id}`)
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(404);
  }, TEST_TIMEOUT_MS);

  it('keeps aggregate inventory views tenant-scoped', async () => {
    const a = await registerAndCreateCompany(app, 'AggA');
    const b = await registerAndCreateCompany(app, 'AggB');

    const createTenantData = async (token: string, codePrefix: string, itemCode: string, description: string) => {
      await request(app)
        .post('/api/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `${codePrefix}-FROM`, type: 'shelf', label: `${codePrefix} From` })
        .expect(201);

      await request(app)
        .post('/api/locations')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: `${codePrefix}-TO`, type: 'shelf', label: `${codePrefix} To` })
        .expect(201);

      const item = await request(app)
        .post('/api/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ upc: itemCode, modifier: '', description, department: 'grocery', price: 10 })
        .expect(201);

      await request(app)
        .post('/api/inventory/move')
        .set('Authorization', `Bearer ${token}`)
        .send({
          itemId: item.body.data._id,
          fromLocationCode: `${codePrefix}-FROM`,
          toLocationCode: `${codePrefix}-TO`,
          qty: 5,
          notes: 'move for aggregate isolation test'
        })
        .expect(201);
    };

    await createTenantData(a.accessToken, 'X', '333', 'Agg Item A');
    await createTenantData(b.accessToken, 'X', '444', 'Agg Item B');

    const inventoryA = await request(app)
      .get('/api/inventory/location/X-TO')
      .set('Authorization', `Bearer ${a.accessToken}`)
      .expect(200);

    expect(inventoryA.body.data.items).toHaveLength(1);
    expect(inventoryA.body.data.items[0].description).toBe('Agg Item A');
  }, TEST_TIMEOUT_MS);
});
