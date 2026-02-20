import { Schema, model, InferSchemaType } from 'mongoose';

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, index: true },
    businessType: { type: String, required: true },
    address: { type: String, required: true },
    phone: { type: String, required: true },
    email: { type: String, required: true },
    timezone: { type: String, required: true },
    currency: { type: String, required: true }
  },
  { timestamps: true }
);

export type CompanyDoc = InferSchemaType<typeof companySchema> & { _id: string };
export const CompanyModel = model('Company', companySchema);
