import { InferSchemaType, Schema, model } from 'mongoose';

const quickBooksOnboardingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    environment: { type: String, enum: ['sandbox', 'production'], required: true },
    realmId: { type: String, required: true, trim: true },
    companyName: { type: String, default: null, trim: true },
    encryptedPayload: { type: String, required: true, select: false }
  },
  { timestamps: true }
);

export type QuickBooksOnboardingDoc = InferSchemaType<typeof quickBooksOnboardingSchema> & { _id: string };
export const QuickBooksOnboardingModel = model('QuickBooksOnboarding', quickBooksOnboardingSchema);
