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
    phase: {
      type: String,
      enum: ['uploaded', 'extracting', 'structuring', 'checks_queued', 'ready_for_review', 'failed'],
      default: 'uploaded'
    },
    totalChecks: { type: Number, default: 0 },
    checksQueued: { type: Number, default: 0 },
    checksProcessing: { type: Number, default: 0 },
    checksReady: { type: Number, default: 0 },
    checksFailed: { type: Number, default: 0 },
    completedChecks: { type: Number, default: 0 },
    remainingChecks: { type: Number, default: 0 }
  },
  { _id: false }
);

const stageTimestampsSchema = new Schema(
  {
    uploadedAt: { type: String, required: false },
    extractingAt: { type: String, required: false },
    structuringAt: { type: String, required: false },
    checksQueuedAt: { type: String, required: false },
    readyForReviewAt: { type: String, required: false },
    failedAt: { type: String, required: false }
  },
  { _id: false }
);

const statementArtifactsSchema = new Schema(
  {
    pageImagePaths: { type: [String], default: [] },
    ocrPath: { type: String, required: false },
    ocrTextPath: { type: String, required: false },
    geminiPath: { type: String, required: false },
    detectionEvidence: { type: String, required: false },
    detectedStatementMonth: { type: String, required: false },
    detectedStatementDate: { type: String, required: false },
    autoAppliedStatementMonth: { type: Boolean, default: false },
    stageTimestamps: { type: stageTimestampsSchema, default: () => ({}) }
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
    artifacts: { type: statementArtifactsSchema, default: () => ({}) },
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
