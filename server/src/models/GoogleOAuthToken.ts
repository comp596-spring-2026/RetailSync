import { InferSchemaType, Schema, model } from 'mongoose';

const googleOAuthTokenSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    expiryDate: { type: Number },
    scope: { type: String },
    tokenType: { type: String }
  },
  { timestamps: true }
);

googleOAuthTokenSchema.index({ companyId: 1, userId: 1 }, { unique: true });

export type GoogleOAuthTokenDoc = InferSchemaType<typeof googleOAuthTokenSchema> & { _id: string };
export const GoogleOAuthTokenModel = model('GoogleOAuthToken', googleOAuthTokenSchema);
