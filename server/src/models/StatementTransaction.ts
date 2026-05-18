import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const proposalSchema = new Schema(
  {
    qbTxnType: {
      type: String,
      enum: ['Expense', 'Deposit', 'Transfer', 'Check', 'SalesReceipt', 'Payment'],
      required: false
    },
    bankAccountId: { type: String, required: false },
    categoryAccountId: { type: String, required: false },
    payeeType: { type: String, enum: ['vendor', 'customer', 'employee', 'other'], required: false },
    payeeId: { type: String, required: false },
    payeeName: { type: String, required: false },
    transferTargetAccountId: { type: String, required: false },
    checkNumber: { type: String, required: false },
    matchExistingCheck: { type: Boolean, required: false },
    salesItemRefId: { type: String, required: false },
    linkedInvoiceTxnId: { type: String, required: false },
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
    statementCheckId: { type: String, required: false, index: true },
    postDate: { type: String, required: true },
    description: { type: String, required: true },
    merchant: { type: String, required: false },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    rowType: {
      type: String,
      enum: [
        'section_header',
        'beginning_balance',
        'ending_balance',
        'daily_balance',
        'summary_total',
        'deposit',
        'electronic_credit',
        'other_credit',
        'electronic_debit',
        'check_cleared',
        'noise'
      ],
      required: false
    },
    section: {
      type: String,
      enum: [
        'account_summary',
        'deposits',
        'electronic_credits',
        'other_credits',
        'electronic_debits',
        'checks_cleared',
        'daily_balances',
        'unknown'
      ],
      required: false
    },
    transactionFamily: {
      type: String,
      enum: ['transfer', 'vendor_payment', 'tax_payment', 'software', 'refund', 'check', 'settlement', 'other'],
      required: false
    },
    isPostingCandidate: { type: Boolean, default: true },
    normalizedDescription: { type: String, required: false },
    counterparty: { type: String, required: false },
    classification: {
      type: String,
      enum: ['check', 'deposit', 'expense', 'payment', 'transfer', 'fee', 'adjustment', 'unknown'],
      default: 'unknown'
    },
    classificationConfidence: { type: Number, required: false },
    suggestedAction: {
      type: String,
      enum: [
        'create_check',
        'create_expense',
        'create_receive_payment',
        'create_deposit',
        'create_transfer',
        'link_existing',
        'ignore'
      ],
      required: false
    },
    balanceAfter: { type: Number, required: false },
    checkNumber: { type: String, required: false },
    sourceLocator: {
      pageNumber: { type: Number, required: false },
      rowIndex: { type: Number, required: false },
      section: { type: String, required: false },
      sourceText: { type: String, required: false },
      bbox: { type: [Number], default: undefined }
    },
    evidence: {
      statementPdfPath: { type: String, required: false },
      pageImagePath: { type: String, required: false },
      checkCropPath: { type: String, required: false },
      ocrPath: { type: String, required: false },
      geminiPath: { type: String, required: false }
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
statementTransactionSchema.index({ companyId: 1, statementId: 1, statementCheckId: 1 });
statementTransactionSchema.plugin(tenantPlugin);

export type StatementTransactionDoc = InferSchemaType<typeof statementTransactionSchema> & {
  _id: string;
};
export const StatementTransactionModel = model(
  'StatementTransaction',
  statementTransactionSchema
);
