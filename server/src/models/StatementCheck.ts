import { InferSchemaType, Schema, Types, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const confidenceSchema = new Schema(
  {
    imageQuality: { type: Number, required: false },
    ocrConfidence: { type: Number, required: false },
    fieldConfidence: { type: Number, required: false },
    crossValidation: { type: Number, required: false },
    overall: { type: Number, default: 0 }
  },
  { _id: false }
);

const stageTimestampsSchema = new Schema(
  {
    queuedAt: { type: String, required: false },
    processingAt: { type: String, required: false },
    processedAt: { type: String, required: false },
    failedAt: { type: String, required: false }
  },
  { _id: false }
);

const artifactsSchema = new Schema(
  {
    pageNumber: { type: Number, required: false },
    cropBBox: { type: [Number], default: undefined },
    cropImagePath: { type: String, required: false },
    ocrTextPath: { type: String, required: false },
    ocrJsonPath: { type: String, required: false },
    structuredPath: { type: String, required: false },
    geminiPath: { type: String, required: false },
    stageTimestamps: { type: stageTimestampsSchema, default: () => ({}) }
  },
  { _id: false }
);

const extractedSchema = new Schema(
  {
    checkNumber: { type: String, required: false },
    date: { type: String, required: false },
    payeeName: { type: String, required: false },
    amount: { type: Number, required: false },
    memo: { type: String, required: false },
    source: {
      type: String,
      enum: ['ocr', 'gemini', 'deterministic', 'legacy', 'pdf_text'],
      required: false
    }
  },
  { _id: false }
);

const processingSchema = new Schema(
  {
    retryCount: { type: Number, default: 0 },
    lastError: { type: String, required: false },
    queuedAt: { type: String, required: false },
    processingAt: { type: String, required: false },
    processedAt: { type: String, required: false }
  },
  { _id: false }
);

const statementCheckSchema = new Schema(
  {
    statementId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'needs_review', 'failed'],
      default: 'queued',
      index: true
    },
    confidence: { type: confidenceSchema, required: false },
    artifacts: { type: artifactsSchema, default: () => ({}) },
    extracted: { type: extractedSchema, required: false },
    processing: { type: processingSchema, default: () => ({}) },
    autoFill: {
      checkNumber: { type: String, required: false },
      date: { type: String, required: false },
      payeeName: { type: String, required: false },
      amount: { type: Number, required: false },
      memo: { type: String, required: false }
    },
    gcs: {
      frontPath: { type: String, required: true },
      backPath: { type: String, required: false },
      ocrPath: { type: String, required: false },
      structuredPath: { type: String, required: false }
    },
    match: {
      statementTransactionId: { type: String, required: false, index: true },
      matchConfidence: { type: Number, required: false },
      reasons: { type: [String], default: [] }
    },
    errors: { type: [String], default: [] }
  },
  {
    timestamps: true,
    // Keep the persisted/API field name `errors` without emitting startup warnings.
    suppressReservedKeysWarning: true
  }
);

statementCheckSchema.index({ companyId: 1, statementId: 1, createdAt: -1 });
statementCheckSchema.index({ companyId: 1, statementId: 1, status: 1, createdAt: -1 });
statementCheckSchema.plugin(tenantPlugin);

export type StatementCheckDoc = InferSchemaType<typeof statementCheckSchema> & { _id: Types.ObjectId };
export const StatementCheckModel = model('StatementCheck', statementCheckSchema);
