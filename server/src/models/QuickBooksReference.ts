import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const quickBooksReferenceSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    entityType: {
      type: String,
      enum: ['vendor', 'customer', 'employee'],
      required: true,
      index: true
    },
    qbId: { type: String, required: true },
    displayName: { type: String, required: true },
    active: { type: Boolean, default: true },
    raw: { type: Schema.Types.Mixed, required: false }
  },
  { timestamps: true }
);

quickBooksReferenceSchema.index({ companyId: 1, entityType: 1, qbId: 1 }, { unique: true });
quickBooksReferenceSchema.plugin(tenantPlugin);

export type QuickBooksReferenceDoc = InferSchemaType<typeof quickBooksReferenceSchema> & {
  _id: string;
};
export const QuickBooksReferenceModel = model(
  'QuickBooksReference',
  quickBooksReferenceSchema
);
