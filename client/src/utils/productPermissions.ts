import {
  legacyPermissionsToProduct,
  productPermissionsExceedActor,
  type PermissionsMap,
  type ProductCapabilityKey
} from '@retailsync/shared';
import { hasPermission } from './permissions';

export const toProductPermissions = (permissions: PermissionsMap | null | undefined) =>
  legacyPermissionsToProduct(permissions ?? ({} as PermissionsMap));

export const hasProductCapability = (
  permissions: PermissionsMap | null | undefined,
  key: ProductCapabilityKey
) => toProductPermissions(permissions)[key];

export const exceedsActorProductPermissions = (
  candidate: Record<ProductCapabilityKey, boolean>,
  actor: PermissionsMap | null | undefined
) => {
  if (!actor) return true;
  return productPermissionsExceedActor(candidate, actor);
};

export const canShowDashboard = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'dashboard', 'view');

export const canShowPos = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'pos', 'view');

export const canUsePosTab = (
  permissions: PermissionsMap | null | undefined,
  tab: 'table' | 'analytics' | 'saleTax'
) => {
  if (!canShowPos(permissions)) return false;
  return hasPermission(permissions, 'pos', `actions:${tab}`);
};

export const canImportPos = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'pos', 'create') && hasPermission(permissions, 'pos', 'actions:import');

export const canShowAccounting = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'accounting', 'view') || hasPermission(permissions, 'bankStatements', 'view');

export const canUploadStatements = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'bankStatements', 'create');

export const canReviewStatements = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'bankStatements', 'edit');

export const canDeleteStatements = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'bankStatements', 'delete');

export const canShowQuickbooks = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'view');

export const canSyncQuickbooks = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'actions:sync');

export const canPostQuickbooks = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'actions:post');

export const canConnectQuickbooks = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'actions:connect') ||
  hasPermission(permissions, 'quickbooks', 'actions:disconnect');

export const canShowSettings = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'settings', 'view');

export const canManageSettings = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'settings', 'edit');

export const canShowAccessUsers = (permissions: PermissionsMap | null | undefined) => {
  const product = toProductPermissions(permissions);
  return (
    product['access.users.view'] ||
    product['access.users.invite'] ||
    product['access.users.assignRoles'] ||
    product['access.users.deactivate']
  );
};

export const canShowAccessRoles = (permissions: PermissionsMap | null | undefined) => {
  const product = toProductPermissions(permissions);
  return (
    product['access.roles.view'] ||
    product['access.roles.create'] ||
    product['access.roles.edit'] ||
    product['access.roles.delete']
  );
};

export const canShowAccess = (permissions: PermissionsMap | null | undefined) =>
  canShowAccessUsers(permissions) || canShowAccessRoles(permissions);
