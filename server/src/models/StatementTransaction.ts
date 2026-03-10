import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

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

const statementTransactionSchema = new Schema(
  {
    statementId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    postDate: { type: String, required: true },
    description: { type: String, required: true },
    merchant: { type: String, required: false },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    balanceAfter: { type: Number, required: false },
    checkNumber: { type: String, required: false },
    sourceLocator: {
      pageNumber: { type: Number, required: false },
      rowIndex: { type: Number, required: false },
      bbox: { type: [Number], default: undefined }
    },
    evidence: {
      statementPdfPath: { type: String, required: false },
      pageImagePath: { type: String, required: false }
    },
    proposal: { type: proposalSchema, default: () => ({}) },
    reviewStatus: {
      type: String,
      enum: ['proposed', 'edited', 'approved', 'excluded'],
      default: 'proposed'
    },
    posting: {
      status: {
        type: String,
        enum: ['not_posted', 'posting', 'posted', 'failed'],
        default: 'not_posted'
      },
      qbTxnId: { type: String, default: null },
      error: { type: String, default: null }
    }
  },
  { timestamps: true }
);

statementTransactionSchema.index({ companyId: 1, statementId: 1, postDate: -1 });
statementTransactionSchema.plugin(tenantPlugin);

export type StatementTransactionDoc = InferSchemaType<typeof statementTransactionSchema> & {
  _id: string;
};
export const StatementTransactionModel = model(
  'StatementTransaction',
  statementTransactionSchema
);
