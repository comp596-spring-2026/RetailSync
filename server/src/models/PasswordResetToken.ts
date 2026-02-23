import { InferSchemaType, Schema, model } from 'mongoose';

const passwordResetTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export type PasswordResetTokenDoc = InferSchemaType<typeof passwordResetTokenSchema>;
export const PasswordResetTokenModel = model('PasswordResetToken', passwordResetTokenSchema);
