import {
  PermissionsMap,
  ROLE_DELEGATION_FORBIDDEN_MESSAGE,
  permissionsExceedActor,
  productPermissionsExceedActor,
  type ProductCapabilityKey
} from '@retailsync/shared';
import { Request } from 'express';
import { RoleModel } from '../models/Role';
import { normalizeRolePermissions } from './rolePermissionsService';

export { ROLE_DELEGATION_FORBIDDEN_MESSAGE };

export const resolveActorPermissions = async (req: Request): Promise<PermissionsMap | null> => {
  if (!req.companyId || !req.roleId) {
    return null;
  }

  const role = await RoleModel.findOne({ _id: req.roleId, companyId: req.companyId }).lean();
  if (!role) {
    return null;
  }

  return normalizeRolePermissions(role.permissions, {
    roleName: String(role.name ?? ''),
    isSystem: Boolean(role.isSystem)
  });
};

export const assertRolePermissionsWithinActor = (
  candidate: PermissionsMap,
  actor: PermissionsMap
) => {
  if (permissionsExceedActor(candidate, actor)) {
    throw new Error(ROLE_DELEGATION_FORBIDDEN_MESSAGE);
  }
};

export const assertProductPermissionsWithinActor = (
  candidate: Record<ProductCapabilityKey, boolean>,
  actor: PermissionsMap
) => {
  if (productPermissionsExceedActor(candidate, actor)) {
    throw new Error(ROLE_DELEGATION_FORBIDDEN_MESSAGE);
  }
};

export const prepareRolePermissionsForSave = async (
  req: Request,
  candidate: PermissionsMap,
  options: { roleName?: string; isSystem?: boolean; basePermissions?: unknown } = {}
): Promise<PermissionsMap> => {
  const normalized = normalizeRolePermissions(candidate, options);
  normalized.dashboard = {
    view: true,
    create: false,
    edit: false,
    delete: false,
    actions: []
  };
  const actor = await resolveActorPermissions(req);
  if (!actor) {
    throw new Error('Forbidden');
  }

  assertRolePermissionsWithinActor(normalized, actor);
  return normalized;
};
