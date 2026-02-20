import { Schema, model, InferSchemaType } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const posDailySummarySchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    date: { type: Date, required: true, index: true },
    day: { type: String, required: true },
    highTax: { type: Number, required: true, default: 0 },
    lowTax: { type: Number, required: true, default: 0 },
    saleTax: { type: Number, required: true, default: 0 },
    totalSales: { type: Number, required: true, default: 0 },
    gas: { type: Number, required: true, default: 0 },
    lottery: { type: Number, required: true, default: 0 },
    creditCard: { type: Number, required: true, default: 0 },
    lotteryPayout: { type: Number, required: true, default: 0 },
    clTotal: { type: Number, required: true, default: 0 },
    cash: { type: Number, required: true, default: 0 },
    cashPayout: { type: Number, required: true, default: 0 },
    cashExpenses: { type: Number, required: true, default: 0 },
    notes: { type: String, default: '' }
  },
  { timestamps: true }
);

posDailySummarySchema.index({ companyId: 1, date: 1 }, { unique: true });
posDailySummarySchema.plugin(tenantPlugin);

export type POSDailySummaryDoc = InferSchemaType<typeof posDailySummarySchema> & { _id: string };
export const POSDailySummaryModel = model('POSDailySummary', posDailySummarySchema);
