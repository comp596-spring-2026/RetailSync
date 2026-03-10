import { InferSchemaType, Schema, model } from 'mongoose';
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
  { timestamps: true }
);

statementCheckSchema.index({ companyId: 1, statementId: 1, createdAt: -1 });
statementCheckSchema.plugin(tenantPlugin);

export type StatementCheckDoc = InferSchemaType<typeof statementCheckSchema> & { _id: string };
export const StatementCheckModel = model('StatementCheck', statementCheckSchema);
