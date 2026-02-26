import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const importJobSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    source: { type: String, enum: ['service', 'oauth', 'file'], default: 'service' },
    status: { type: String, enum: ['queued', 'processing', 'done', 'failed'], default: 'queued' },
    mapping: { type: Map, of: String, default: {} },
    transforms: { type: Map, of: Schema.Types.Mixed, default: {} },
    options: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

importJobSchema.index({ companyId: 1, createdAt: -1 });
importJobSchema.plugin(tenantPlugin);

export type ImportJobDoc = InferSchemaType<typeof importJobSchema> & { _id: string };
export const ImportJobModel = model('ImportJob', importJobSchema);
