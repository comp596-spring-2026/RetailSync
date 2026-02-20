import { InferSchemaType, Schema, model } from 'mongoose';

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jtiHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true, index: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ userId: 1, jtiHash: 1 }, { unique: true });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema> & { _id: string };
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
