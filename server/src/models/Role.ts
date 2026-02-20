import { moduleKeys } from '@retailsync/shared';
import { Schema, model, InferSchemaType } from 'mongoose';
import { tenantPlugin } from './plugins/tenantPlugin';

const permissionSetSchema = new Schema(
  {
    view: { type: Boolean, required: true },
    create: { type: Boolean, required: true },
    edit: { type: Boolean, required: true },
    delete: { type: Boolean, required: true },
    actions: { type: [String], default: [] }
  },
  { _id: false }
);

const permissionsShape = Object.fromEntries(moduleKeys.map((module) => [module, { type: permissionSetSchema, required: true }]));

const roleSchema = new Schema(
  {
    companyId: { type: Schema.Types.ObjectId, required: true, ref: 'Company', index: true },
    name: { type: String, required: true, trim: true },
    isSystem: { type: Boolean, default: false },
    permissions: { type: new Schema(permissionsShape, { _id: false }), required: true }
  },
  { timestamps: true }
);

roleSchema.index({ companyId: 1, name: 1 }, { unique: true });
roleSchema.plugin(tenantPlugin);

export type RoleDoc = InferSchemaType<typeof roleSchema> & { _id: string };
export const RoleModel = model('Role', roleSchema);
