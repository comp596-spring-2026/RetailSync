import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { InventoryLedgerModel } from './models/InventoryLedger';
import { clearTestDb, connectTestDb, disconnectTestDb, setupTestEnv } from './test/testUtils';

describe('inventory ledger immutability', () => {
  beforeAll(async () => {
    setupTestEnv();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('rejects updateOne operations', async () => {
    const companyId = new mongoose.Types.ObjectId();
    const itemId = new mongoose.Types.ObjectId();

    const entry = await InventoryLedgerModel.create({
      companyId,
      itemId,
      type: 'adjustment',
      qty: 1,
      notes: 'seed'
    });

    await expect(
      InventoryLedgerModel.updateOne(
        { _id: entry._id, companyId },
        { $set: { qty: 99 } }
      )
    ).rejects.toThrow('Ledger entries are immutable');
  });
});
