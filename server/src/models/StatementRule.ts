import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const statementRuleConditionSchema = new Schema(
  {
    contains: { type: String, required: false },
    direction: { type: String, enum: ['debit', 'credit'], required: false },
    minAmount: { type: Number, required: false },
    maxAmount: { type: Number, required: false },
    dateFrom: { type: String, required: false },
    dateTo: { type: String, required: false }
  },
  { _id: false }
);

const statementRuleActionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['suggestIgnore', 'suggestPayee', 'suggestCategory', 'suggestTxnType'],
      required: true
    },
    proposedTxnType: { type: String, enum: ['Expense', 'Deposit', 'Transfer', 'Check'], required: false },
    bankAccountId: { type: String, required: false },
    payeeName: { type: String, required: false },
    categoryAccountId: { type: String, required: false },
    memo: { type: String, required: false }
  },
  { _id: false }
);

const statementRuleSchema = new Schema(
  {
    statementId: { type: String, required: true, index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    hardness: { type: String, enum: ['soft', 'hard'], required: true },
    conditions: { type: statementRuleConditionSchema, default: () => ({}) },
    action: { type: statementRuleActionSchema, required: true }
  },
  { timestamps: true }
);

statementRuleSchema.index({ companyId: 1, statementId: 1, enabled: 1, updatedAt: -1 });
statementRuleSchema.plugin(tenantPlugin);

export type StatementRuleDoc = InferSchemaType<typeof statementRuleSchema> & { _id: string };
export const StatementRuleModel = model('StatementRule', statementRuleSchema);
