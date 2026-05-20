import {
  adminProductPermissions,
  memberProductPermissions,
  productPermissionsToLegacy,
  viewerProductPermissions
} from '@retailsync/shared';

export const adminPermissions = () => productPermissionsToLegacy(adminProductPermissions());

export const memberPermissions = () => productPermissionsToLegacy(memberProductPermissions());

export const viewerPermissions = () => productPermissionsToLegacy(viewerProductPermissions());
