import type { PermissionSet } from '../permissions/permissions';
import { moduleActionCatalog, type ModuleKey, moduleKeys } from './modules';

export type ModuleCrudField = 'view' | 'create' | 'edit' | 'delete';

/** CRUD flags that are enforced by backend routes for each module. */
export const moduleCrudFields: Record<ModuleKey, ModuleCrudField[]> = {
  dashboard: ['view'],
  pos: ['view', 'create'],
  bankStatements: ['view', 'create', 'edit', 'delete'],
  users: ['view', 'edit', 'delete'],
  rolesSettings: ['view', 'create', 'edit', 'delete'],
  settings: ['view', 'edit'],
  accounting: ['view'],
  ledger: ['view', 'edit'],
  quickbooks: ['view', 'create', 'edit', 'delete']
};

export const moduleSupportsCrud = (moduleKey: ModuleKey, field: ModuleCrudField) =>
  moduleCrudFields[moduleKey].includes(field);

export const moduleSupportsActions = (moduleKey: ModuleKey) =>
  (moduleActionCatalog[moduleKey] ?? []).length > 0;

export const sanitizeModulePermissionSet = (moduleKey: ModuleKey, permission: PermissionSet): PermissionSet => {
  const allowedActions = moduleActionCatalog[moduleKey] ?? [];

  return {
    view: moduleSupportsCrud(moduleKey, 'view') ? permission.view : false,
    create: moduleSupportsCrud(moduleKey, 'create') ? permission.create : false,
    edit: moduleSupportsCrud(moduleKey, 'edit') ? permission.edit : false,
    delete: moduleSupportsCrud(moduleKey, 'delete') ? permission.delete : false,
    actions: permission.actions.filter(
      (action) => action === '*' || allowedActions.includes(action)
    )
  };
};

export const sanitizePermissionsMap = (permissions: Record<string, PermissionSet>) => {
  const sanitized = {} as Record<ModuleKey, PermissionSet>;
  for (const moduleKey of moduleKeys) {
    const current = permissions[moduleKey];
    if (!current) {
      sanitized[moduleKey] = {
        view: false,
        create: false,
        edit: false,
        delete: false,
        actions: []
      };
      continue;
    }
    sanitized[moduleKey] = sanitizeModulePermissionSet(moduleKey, current);
  }
  return sanitized;
};
