import { ModuleKey } from '@retailsync/shared';
import { NextFunction, Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { normalizeRolePermissions } from '../services/rolePermissionsService';
import { fail } from '../utils/apiResponse';

type CrudAction = 'view' | 'create' | 'edit' | 'delete';

type PermissionCheck = {
  moduleKey: ModuleKey;
  action: CrudAction | string;
};

const isAllowed = (
  permission: { view: boolean; create: boolean; edit: boolean; delete: boolean; actions: string[] },
  action: string
) => {
  if ((['view', 'create', 'edit', 'delete'] as CrudAction[]).includes(action as CrudAction)) {
    return permission[action as CrudAction];
  }

  return permission.actions.includes('*') || permission.actions.includes(action);
};

export const requireAnyPermission = (checks: PermissionCheck[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.companyId || !req.roleId) {
      return fail(res, 'Company onboarding required', 403);
    }

    const role = await RoleModel.findOne({ _id: req.roleId, companyId: req.companyId });
    if (!role) {
      return fail(res, 'Role not found', 403);
    }

    const permissionsMap = normalizeRolePermissions(role.permissions, {
      roleName: String(role.name ?? ''),
      isSystem: Boolean(role.isSystem)
    });

    const allowed = checks.some((check) => {
      const permission = permissionsMap[check.moduleKey];
      if (!permission) return false;
      return isAllowed(permission, check.action);
    });

    if (!allowed) {
      return fail(res, 'Forbidden', 403);
    }

    return next();
  };
};
