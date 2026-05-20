import type { PermissionsMap } from '@retailsync/shared';
import { hasPermission } from './permissions';
import { canManageSettings } from './productPermissions';

export const canQuickBooksView = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'view');

export const canQuickBooksSync = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'actions:sync');

export const canQuickBooksPost = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'actions:post');

export const canQuickBooksConnect = (permissions: PermissionsMap | null | undefined) =>
  hasPermission(permissions, 'quickbooks', 'actions:connect') ||
  hasPermission(permissions, 'quickbooks', 'actions:disconnect');

/** Posting and entity write flows in the QuickBooks workspace. */
export const canQuickBooksWrite = canQuickBooksPost;
export const canQuickBooksCreate = canQuickBooksPost;
export const canQuickBooksEdit = canQuickBooksPost;
export const canQuickBooksDelete = canQuickBooksPost;

export const canManageQuickBooksConnection = (permissions: PermissionsMap | null | undefined) =>
  canQuickBooksConnect(permissions) ||
  (canManageSettings(permissions) && canQuickBooksView(permissions));
