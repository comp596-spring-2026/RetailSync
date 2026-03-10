import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const runSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    statementId: { type: String, required: false, index: true },
    integrationId: { type: String, required: false, index: true },
    runType: { type: String, enum: ['pipeline', 'sync'], required: true, index: true },
    job: {
      type: String,
      enum: [
        'statement.extract',
        'statement.structure',
        'checks.spawn',
        'check.process',
        'matching.refresh',
        'quickbooks.refresh_reference_data',
        'quickbooks.post_approved'
      ],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['queued', 'running', 'success', 'failed'],
      default: 'queued',
      index: true
    },
    metrics: { type: Schema.Types.Mixed, required: false },
    artifacts: { type: Map, of: String, default: undefined },
    errors: { type: [String], default: [] },
    traceId: { type: String, required: false }
  },
  { timestamps: true }
);

runSchema.index({ companyId: 1, runType: 1, status: 1, updatedAt: -1 });
runSchema.index({ companyId: 1, statementId: 1, job: 1, createdAt: -1 });
runSchema.plugin(tenantPlugin);

export type RunDoc = InferSchemaType<typeof runSchema> & { _id: string };
export const RunModel = model('Run', runSchema);
