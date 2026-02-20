import { ModuleKey } from '@retailsync/shared';
import { NextFunction, Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { fail } from '../utils/apiResponse';

type CrudAction = 'view' | 'create' | 'edit' | 'delete';

const isAllowed = (permission: { view: boolean; create: boolean; edit: boolean; delete: boolean; actions: string[] }, action: string) => {
  if ((['view', 'create', 'edit', 'delete'] as CrudAction[]).includes(action as CrudAction)) {
    return permission[action as CrudAction];
  }

  return permission.actions.includes('*') || permission.actions.includes(action);
};

export const requirePermission = (moduleKey: ModuleKey, action: CrudAction | string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.companyId || !req.roleId) {
      return fail(res, 'Company onboarding required', 403);
    }

    const role = await RoleModel.findOne({ _id: req.roleId, companyId: req.companyId });
    if (!role) {
      return fail(res, 'Role not found', 403);
    }

    const permissionsMap =
      (role.permissions as unknown as Record<
        string,
        { view: boolean; create: boolean; edit: boolean; delete: boolean; actions: string[] }
      >) ?? {};
    const permission = permissionsMap[moduleKey];
    if (!permission || !isAllowed(permission, action)) {
      return fail(res, 'Forbidden', 403);
    }

    return next();
  };
};
