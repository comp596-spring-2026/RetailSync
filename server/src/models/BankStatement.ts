import { Schema, model, InferSchemaType } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const statusValues = ['uploaded', 'processing', 'needs_review', 'confirmed', 'locked', 'failed'] as const;
const processingStageValues = ['queued', 'pages_ready', 'ocr_ready', 'checks_ready', 'structured_ready', 'confirmed', 'locked', 'failed'] as const;
const sourceValues = ['upload', 'manual', 'email'] as const;

const pageSchema = new Schema(
  {
    pageNo: { type: Number, required: true },
    gcsPath: { type: String, required: true },
    width: { type: Number, required: false },
    height: { type: Number, required: false }
  },
  { _id: false }
);

const checkSchema = new Schema(
  {
    checkId: { type: String, required: true },
    pageNo: { type: Number, required: true },
    bbox: { type: [Number], default: [] },
    gcsPath: { type: String, required: true },
    linkedTransactionId: { type: String }
  },
  { _id: false }
);

const jobRunSchema = new Schema(
  {
    taskId: { type: String, required: true },
    jobType: { type: String, required: true },
    status: { type: String, enum: ['queued', 'running', 'completed', 'failed'], required: true },
    attempt: { type: Number, default: 1 },
    startedAt: { type: Date, required: false },
    endedAt: { type: Date, required: false },
    error: { type: String, required: false }
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
    processingStage: {
      type: String,
      enum: processingStageValues,
      default: 'queued'
    },
    files: {
      pdf: {
        gcsPath: { type: String, required: true },
        signedUrl: { type: String, required: false }
      },
      pages: { type: [pageSchema], default: [] },
      checks: { type: [checkSchema], default: [] }
    },
    extraction: {
      rawOcrText: { type: String, required: false },
      structuredJson: { type: Schema.Types.Mixed, required: false },
      issues: { type: [String], default: [] },
      confidence: { type: Number, required: false }
    },
    jobRuns: { type: [jobRunSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

bankStatementSchema.index({ companyId: 1, statementMonth: -1, createdAt: -1 });
bankStatementSchema.plugin(tenantPlugin);

export type BankStatementDoc = InferSchemaType<typeof bankStatementSchema> & { _id: string };
export const BankStatement = model('BankStatement', bankStatementSchema);
