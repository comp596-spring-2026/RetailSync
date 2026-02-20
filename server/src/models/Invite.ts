import { Schema, model, InferSchemaType } from 'mongoose';

const inviteSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true, unique: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

inviteSchema.index({ companyId: 1, email: 1, acceptedAt: 1 });

export type InviteDoc = InferSchemaType<typeof inviteSchema> & { _id: string };
export const InviteModel = model('Invite', inviteSchema);
