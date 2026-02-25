import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleId: { type: String, unique: true, sparse: true, default: null },
    passwordHash: { type: String, required: true },
    emailVerifiedAt: { type: Date, default: null },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };
export const UserModel = model('User', userSchema);
