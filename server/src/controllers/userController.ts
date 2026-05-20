import { assignRoleSchema, updateUserSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';
import { fail, ok } from '../utils/apiResponse';
import {
  PROTECTED_ADMIN_MESSAGE,
  assertMemberRoleChangeAllowed,
  assertNotDeletingLastAdmin,
  isProtectedAdminMember
} from '../utils/memberGuards';

const resolveRoleId = (roleId: unknown): string | undefined => {
  if (!roleId) return undefined;
  if (typeof roleId === 'object' && roleId !== null && '_id' in roleId) {
    return String((roleId as { _id: unknown })._id);
  }
  return String(roleId);
};

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

export const updateUser = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const existingUser = await UserModel.findOne({ _id: req.params.id, companyId: req.companyId })
    .select('_id roleId')
    .populate('roleId', 'name isSystem');

  if (!existingUser) {
    return fail(res, 'User not found', 404);
  }

  if (isProtectedAdminMember(existingUser)) {
    return fail(res, PROTECTED_ADMIN_MESSAGE, 400);
  }

  const user = await UserModel.findOneAndUpdate(
    { _id: req.params.id, companyId: req.companyId },
    { $set: { firstName: parsed.data.firstName, lastName: parsed.data.lastName } },
    { new: true }
  )
    .select('-passwordHash')
    .populate('roleId', 'name isSystem');

  if (!user) {
    return fail(res, 'User not found', 404);
  }

  return ok(res, user);
};

export const deleteUser = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  if (req.params.id === req.user?.id) {
    return fail(res, 'You cannot remove your own account.', 400);
  }

  const existingUser = await UserModel.findOne({ _id: req.params.id, companyId: req.companyId })
    .select('_id roleId isActive')
    .populate('roleId', 'name isSystem');

  if (!existingUser) {
    return fail(res, 'User not found', 404);
  }

  if (!existingUser.isActive) {
    return fail(res, 'User is already inactive', 400);
  }

  if (isProtectedAdminMember(existingUser)) {
    return fail(res, PROTECTED_ADMIN_MESSAGE, 400);
  }

  const lastAdminError = await assertNotDeletingLastAdmin({
    companyId: req.companyId,
    currentRoleId: resolveRoleId(existingUser.roleId)
  });
  if (lastAdminError) {
    return fail(res, lastAdminError, 400);
  }

  const user = await UserModel.findOneAndUpdate(
    { _id: req.params.id, companyId: req.companyId },
    { $set: { isActive: false } },
    { new: true }
  )
    .select('-passwordHash')
    .populate('roleId', 'name isSystem');

  if (!user) {
    return fail(res, 'User not found', 404);
  }

  return ok(res, user);
};

export const assignUserRole = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = assignRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (req.params.id === req.user?.id) {
    return fail(res, 'You cannot change your own role.', 400);
  }

  const role = await RoleModel.findOne({ _id: parsed.data.roleId, companyId: req.companyId });
  if (!role) {
    return fail(res, 'Role not found', 404);
  }

  const existingUser = await UserModel.findOne({ _id: req.params.id, companyId: req.companyId })
    .select('_id roleId')
    .populate('roleId', 'name isSystem');

  if (!existingUser) {
    return fail(res, 'User not found', 404);
  }

  const roleChangeError = await assertMemberRoleChangeAllowed({
    companyId: req.companyId,
    userId: existingUser._id.toString(),
    currentRoleId: resolveRoleId(existingUser.roleId),
    nextRoleId: role._id.toString(),
    targetUser: existingUser
  });
  if (roleChangeError) {
    return fail(res, roleChangeError, 400);
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
