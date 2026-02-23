import { InferSchemaType, Schema, model } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const integrationSecretSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    provider: {
      type: String,
      enum: ['google_oauth', 'quickbooks_oauth', 'google_service_account'],
      required: true
    },
    encryptedPayload: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

integrationSecretSchema.index({ companyId: 1, provider: 1 }, { unique: true });
integrationSecretSchema.plugin(tenantPlugin);

export type IntegrationSecretDoc = InferSchemaType<typeof integrationSecretSchema> & { _id: string };
export const IntegrationSecretModel = model('IntegrationSecret', integrationSecretSchema);
