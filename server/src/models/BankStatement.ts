import { Schema, model, InferSchemaType } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const statusValues = [
  'uploaded',
  'extracting',
  'structuring',
  'checks_queued',
  'ready_for_review',
  'failed'
] as const;
const sourceValues = ['upload', 'manual', 'email'] as const;

const progressSchema = new Schema(
  {
    totalChecks: { type: Number, default: 0 },
    checksQueued: { type: Number, default: 0 },
    checksProcessing: { type: Number, default: 0 },
    checksReady: { type: Number, default: 0 },
    checksFailed: { type: Number, default: 0 }
  },
  { _id: false }
);

const bankStatementSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    statementMonth: { type: String, required: true },
    fileName: { type: String, required: true },
    source: { type: String, enum: sourceValues, default: 'upload' },
    status: {
      type: String,
      enum: statusValues,
      default: 'uploaded',
      index: true
    },
    periodStart: { type: String, required: false },
    periodEnd: { type: String, required: false },
    bankName: { type: String, required: false },
    accountLast4: { type: String, required: false },
    gcs: {
      rootPrefix: { type: String, required: true },
      pdfPath: { type: String, required: true }
    },
    progress: { type: progressSchema, default: () => ({}) },
    hash: { type: String, required: false, index: true },
    issues: { type: [String], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

bankStatementSchema.index({ companyId: 1, statementMonth: -1, createdAt: -1 });
bankStatementSchema.plugin(tenantPlugin);

export type BankStatementDoc = InferSchemaType<typeof bankStatementSchema> & { _id: string };
export const BankStatement = model('BankStatement', bankStatementSchema);
