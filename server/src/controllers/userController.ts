import { assignRoleSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';
import { fail, ok } from '../utils/apiResponse';

export const listUsers = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const users = await UserModel.find({ companyId: req.companyId })
    .select('-passwordHash')
    .populate('roleId', 'name isSystem')
    .sort({ createdAt: -1 });

  return ok(res, users);
};

export const assignUserRole = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const role = await RoleModel.findOne({ _id: parsed.data.roleId, companyId: req.companyId });
  if (!role) {
    return fail(res, 'Role not found', 404);
  }

  const user = await UserModel.findOneAndUpdate(
    { _id: req.params.id, companyId: req.companyId },
    { $set: { roleId: role._id } },
    { new: true }
  )
    .select('-passwordHash')
    .populate('roleId', 'name isSystem');

  if (!user) {
    return fail(res, 'User not found', 404);
  }

  return ok(res, user);
};
