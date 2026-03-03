import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const chartOfAccountSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] },
    qbAccountId: { type: String, default: null },
    isSystem: { type: Boolean, default: false }
  },
  { timestamps: true }
);

chartOfAccountSchema.index({ companyId: 1, code: 1 }, { unique: true });
chartOfAccountSchema.index(
  { companyId: 1, qbAccountId: 1 },
  { unique: true, partialFilterExpression: { qbAccountId: { $type: 'string' } } }
);
chartOfAccountSchema.plugin(tenantPlugin);

export type ChartOfAccountDoc = InferSchemaType<typeof chartOfAccountSchema> & { _id: string };
export const ChartOfAccountModel = model('ChartOfAccount', chartOfAccountSchema);
