import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    googleId: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    emailVerifiedAt: { type: Date, default: null },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', default: null },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

userSchema.index(
  { googleId: 1 },
  {
    unique: true,
    partialFilterExpression: { googleId: { $type: 'string' } }
  }
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: string };
export const UserModel = model('User', userSchema);
