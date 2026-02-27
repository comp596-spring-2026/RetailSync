import { ModuleKey, PermissionsMap } from '@retailsync/shared';

export const hasPermission = (
  permissions: PermissionsMap | null | undefined,
  moduleKey: ModuleKey,
  action: 'view' | 'create' | 'edit' | 'delete' | `actions:${string}`
) => {
  if (!permissions) return true;

  const modulePermissions = permissions[moduleKey];
  if (!modulePermissions) return false;

  if (action === 'view' || action === 'create' || action === 'edit' || action === 'delete') {
    return modulePermissions[action];
  }

  const customAction = action.replace('actions:', '');
  return modulePermissions.actions.includes('*') || modulePermissions.actions.includes(customAction);
};
