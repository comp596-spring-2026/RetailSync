import { Schema, model, InferSchemaType } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const locationSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['shelf', 'fridge', 'freezer', 'backroom'] },
    label: { type: String, required: true, trim: true }
  },
  { timestamps: true }
);

locationSchema.index({ companyId: 1, code: 1 }, { unique: true });
locationSchema.plugin(tenantPlugin);

export type LocationDoc = InferSchemaType<typeof locationSchema> & { _id: string };
export const LocationModel = model('Location', locationSchema);
