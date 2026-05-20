import { ModuleKey } from '@retailsync/shared';
import { NextFunction, Request, Response } from 'express';
import { RoleModel } from '../models/Role';
import { normalizeRolePermissions } from '../services/rolePermissionsService';
import { fail } from '../utils/apiResponse';

type MutationKind = 'create' | 'edit' | 'delete';

const canMutateQuickBooks = (
  permission: { create: boolean; edit: boolean; delete: boolean; actions: string[] },
  kind: MutationKind
) => {
  if (permission.actions.includes('*') || permission.actions.includes('post')) {
    return true;
  }
  return permission[kind];
};

export const requireQuickBooksMutation = (kind: MutationKind) => {
  const moduleKey: ModuleKey = 'quickbooks';

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
    const permission = permissionsMap[moduleKey]!;

    if (!canMutateQuickBooks(permission, kind)) {
      return fail(res, 'Forbidden', 403);
    }

    return next();
  };
};
