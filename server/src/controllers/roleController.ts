import { moduleActionCatalog, moduleKeys, roleCreateSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { fail, ok } from '../utils/apiResponse';

export const listRoles = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const roles = await RoleModel.find({ companyId: req.companyId }).sort({ isSystem: -1, name: 1 });
  return ok(res, roles);
};

export const createRole = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = roleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const exists = await RoleModel.exists({ companyId: req.companyId, name: parsed.data.name });
  if (exists) {
    return fail(res, 'Role name already exists', 409);
  }

  const role = await RoleModel.create({
    companyId: req.companyId,
    name: parsed.data.name,
    permissions: parsed.data.permissions,
    isSystem: false
  });

  return ok(res, role, 201);
};

export const updateRole = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = roleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const role = await RoleModel.findOneAndUpdate(
    { _id: req.params.id, companyId: req.companyId },
    {
      $set: {
        name: parsed.data.name,
        permissions: parsed.data.permissions
      }
    },
    { new: true }
  );

  if (!role) {
    return fail(res, 'Role not found', 404);
  }

  return ok(res, role);
};

export const deleteRole = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const role = await RoleModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!role) {
    return fail(res, 'Role not found', 404);
  }
  if (role.isSystem) {
    return fail(res, 'System role cannot be deleted', 400);
  }

  await role.deleteOne();
  return ok(res, { deleted: true });
};

export const modulesCatalog = (_req: Request, res: Response) => {
  return ok(res, { modules: moduleKeys, actions: moduleActionCatalog });
};
