import {
  moduleActionCatalog,
  moduleKeys,
  productCapabilityGroups,
  roleCreateSchema
} from '@retailsync/shared';
import { Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';
import {
  ROLE_DELEGATION_FORBIDDEN_MESSAGE,
  prepareRolePermissionsForSave,
  resolveActorPermissions
} from '../services/rolePermissionDelegation';
import { normalizeRolePermissions } from '../services/rolePermissionsService';
import { fail, ok } from '../utils/apiResponse';

export const listRoles = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const roles = await RoleModel.find({ companyId: req.companyId }).sort({ isSystem: -1, name: 1 });
  return ok(
    res,
    roles.map((role) => ({
      ...role.toObject(),
      permissions: normalizeRolePermissions(role.permissions, {
        roleName: String(role.name ?? ''),
        isSystem: Boolean(role.isSystem)
      })
    }))
  );
};

export const productPermissionCatalog = async (req: Request, res: Response) => {
  const actor = await resolveActorPermissions(req);
  if (!actor) {
    return fail(res, 'Forbidden', 403);
  }

  return ok(res, { groups: productCapabilityGroups, actorPermissions: actor });
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

  try {
    const permissions = await prepareRolePermissionsForSave(req, parsed.data.permissions, {
      roleName: parsed.data.name,
      isSystem: false
    });

    const role = await RoleModel.create({
      companyId: req.companyId,
      name: parsed.data.name,
      permissions,
      isSystem: false
    });

    return ok(res, role, 201);
  } catch (error) {
    if (error instanceof Error && error.message === ROLE_DELEGATION_FORBIDDEN_MESSAGE) {
      return fail(res, error.message, 403);
    }
    throw error;
  }
};

export const updateRole = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = roleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const role = await RoleModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!role) {
    return fail(res, 'Role not found', 404);
  }

  if (role.isSystem) {
    return fail(res, 'System roles are read-only.', 400);
  }

  try {
    const existingRoleName = String(role.name ?? '');
    role.name = parsed.data.name;
    role.permissions = (await prepareRolePermissionsForSave(req, parsed.data.permissions, {
      roleName: existingRoleName,
      isSystem: Boolean(role.isSystem),
      basePermissions: role.permissions
    })) as typeof role.permissions;
    await role.save();

    return ok(res, role);
  } catch (error) {
    if (error instanceof Error && error.message === ROLE_DELEGATION_FORBIDDEN_MESSAGE) {
      return fail(res, error.message, 403);
    }
    throw error;
  }
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

  const assignedCount = await UserModel.countDocuments({
    companyId: req.companyId,
    roleId: role._id
  });
  if (assignedCount > 0) {
    return fail(
      res,
      'Cannot delete this role because users are assigned to it. Reassign users first.',
      400
    );
  }

  await role.deleteOne();
  return ok(res, { deleted: true });
};

export const modulesCatalog = (_req: Request, res: Response) => {
  return ok(res, { modules: moduleKeys, actions: moduleActionCatalog });
};
