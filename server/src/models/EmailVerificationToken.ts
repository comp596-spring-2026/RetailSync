import { InferSchemaType, Schema, model } from 'mongoose';

const emailVerificationTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type EmailVerificationTokenDoc = InferSchemaType<typeof emailVerificationTokenSchema>;
export const EmailVerificationTokenModel = model('EmailVerificationToken', emailVerificationTokenSchema);
