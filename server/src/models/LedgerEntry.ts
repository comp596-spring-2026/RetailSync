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

const proposalSchema = new Schema(
  {
    qbTxnType: { type: String, enum: ['Expense', 'Deposit', 'Transfer', 'Check'], required: false },
    bankAccountId: { type: String, required: false },
    categoryAccountId: { type: String, required: false },
    payeeType: { type: String, enum: ['vendor', 'customer', 'employee', 'other'], required: false },
    payeeId: { type: String, required: false },
    payeeName: { type: String, required: false },
    transferTargetAccountId: { type: String, required: false },
    memo: { type: String, default: '' },
    confidence: { type: Number, default: 0 },
    reasons: { type: [String], default: [] },
    status: { type: String, enum: ['proposed', 'edited', 'approved', 'excluded'], default: 'proposed' },
    version: { type: String, default: 'v1' }
  },
  { _id: false }
);

const postingSchema = new Schema(
  {
    status: { type: String, enum: ['not_posted', 'posting', 'posted', 'failed'], default: 'not_posted' },
    qbTxnId: { type: String, default: null, index: true },
    error: { type: String, default: null },
    postedAt: { type: Date, default: null },
    attempts: { type: Number, default: 0 }
  },
  { _id: false }
);

const ledgerEntrySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    sourceType: { type: String, enum: ['statement'], default: 'statement' },
    statementId: { type: String, required: true, index: true },
    statementTransactionId: { type: String, required: true, index: true },
    statementCheckId: { type: String, required: false, index: true },
    date: { type: String, required: true },
    description: { type: String, required: true },
    merchant: { type: String, required: false },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    balanceAfter: { type: Number, required: false },
    attachments: {
      statementPdfPath: { type: String, default: null },
      statementPageImagePath: { type: String, default: null },
      checkFrontPath: { type: String, default: null },
      checkBackPath: { type: String, default: null }
    },
    confidence: { type: confidenceSchema, required: false },
    proposal: { type: proposalSchema, default: () => ({}) },
    reviewStatus: {
      type: String,
      enum: ['proposed', 'edited', 'approved', 'excluded'],
      default: 'proposed',
      index: true
    },
    posting: { type: postingSchema, default: () => ({}) },
    fallbackJournalLines: {
      type: [
        {
          accountCode: { type: String, required: true },
          debit: { type: Number, default: 0 },
          credit: { type: Number, default: 0 },
          description: { type: String, required: false }
        }
      ],
      default: []
    }
  },
  { timestamps: true }
);

ledgerEntrySchema.index(
  { companyId: 1, statementId: 1, statementTransactionId: 1 },
  { unique: true }
);
ledgerEntrySchema.index({ companyId: 1, reviewStatus: 1, 'posting.status': 1, date: -1 });
ledgerEntrySchema.plugin(tenantPlugin);

export type LedgerEntryDoc = InferSchemaType<typeof ledgerEntrySchema> & { _id: string };
export const LedgerEntryModel = model('LedgerEntry', ledgerEntrySchema);
