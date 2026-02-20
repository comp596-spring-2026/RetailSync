import { Schema, model, InferSchemaType } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const itemSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    upc: { type: String, required: true, trim: true },
    modifier: { type: String, default: '', trim: true },
    description: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    sku: { type: String, trim: true, default: '' },
    barcode: { type: String, required: true, trim: true },
    defaultLocationId: { type: Schema.Types.ObjectId, ref: 'Location', default: null }
  },
  { timestamps: true }
);

itemSchema.index({ companyId: 1, barcode: 1 }, { unique: true });
itemSchema.index({ companyId: 1, upc: 1, modifier: 1 }, { unique: true });
itemSchema.plugin(tenantPlugin);

export type ItemDoc = InferSchemaType<typeof itemSchema> & { _id: string };
export const ItemModel = model('Item', itemSchema);
