import { Schema, model, InferSchemaType } from 'mongoose';

const inventoryLedgerSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    itemId: { type: Schema.Types.ObjectId, ref: 'Item', required: true, index: true },
    fromLocationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    toLocationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null },
    type: { type: String, required: true, enum: ['purchase', 'sale', 'move', 'adjustment'] },
    qty: { type: Number, required: true },
    unitCost: { type: Number, default: 0 },
    referenceType: { type: String, default: '' },
    referenceId: { type: String, default: '' },
    notes: { type: String, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

inventoryLedgerSchema.index({ companyId: 1, itemId: 1, createdAt: -1 });
inventoryLedgerSchema.index({ companyId: 1, fromLocationId: 1, toLocationId: 1 });

export type InventoryLedgerDoc = InferSchemaType<typeof inventoryLedgerSchema> & { _id: string };
export const InventoryLedgerModel = model('InventoryLedger', inventoryLedgerSchema);
