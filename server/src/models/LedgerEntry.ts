import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const lineSchema = new Schema(
  {
    accountCode: { type: String, required: true },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    category: { type: String, default: '' }
  },
  { _id: false }
);

const ledgerEntrySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    date: { type: String, required: true },
    memo: { type: String, default: '' },
    lines: { type: [lineSchema], default: [] },
    source: {
      statementId: { type: String, required: false, index: true },
      transactionId: { type: String, required: false, index: true }
    },
    status: { type: String, enum: ['draft', 'posted', 'reversed'], default: 'draft', index: true },
    qbTxnId: { type: String, default: null, index: true },
    qbSyncedAt: { type: Date, default: null },
    qbSyncError: { type: String, default: null },
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    postedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

ledgerEntrySchema.index(
  { companyId: 1, 'source.statementId': 1, 'source.transactionId': 1 },
  { unique: true, partialFilterExpression: { 'source.statementId': { $exists: true }, 'source.transactionId': { $exists: true } } }
);
ledgerEntrySchema.plugin(tenantPlugin);

export type LedgerEntryDoc = InferSchemaType<typeof ledgerEntrySchema> & { _id: string };
export const LedgerEntryModel = model('LedgerEntry', ledgerEntrySchema);
