import { InferSchemaType, Schema, model } from 'mongoose';

const jobLockSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    isLocked: { type: Boolean, default: false },
    lockedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null }
  },
  { timestamps: true }
);

jobLockSchema.index({ key: 1 }, { unique: true });

export type JobLockDoc = InferSchemaType<typeof jobLockSchema> & { _id: string };
export const JobLockModel = model('JobLock', jobLockSchema);

