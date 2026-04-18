import { InferSchemaType, Schema, model } from 'mongoose';

const authActionTypes = ['email_verification', 'password_reset'] as const;

const authActionTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    purpose: { type: String, enum: authActionTypes, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    sentToEmail: { type: String, required: true, lowercase: true, trim: true },
    expiresAt: { type: Date, required: true, index: true },
    consumedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

authActionTokenSchema.index({ userId: 1, purpose: 1, consumedAt: 1, expiresAt: 1 });

export type AuthActionTokenType = (typeof authActionTypes)[number];
export type AuthActionTokenDoc = InferSchemaType<typeof authActionTokenSchema> & { _id: string };
export const AuthActionTokenModel = model('AuthActionToken', authActionTokenSchema);
