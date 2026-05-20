import { describe, expect, it } from 'vitest';
import {
  adminProductPermissions,
  memberProductPermissions,
  moduleKeys,
  productPermissionsToLegacy,
  type PermissionsMap
} from '@retailsync/shared';
import { canManageQuickBooksConnection, canQuickBooksConnect } from './quickbooksPermissions';

const buildPermissions = (overrides: Partial<PermissionsMap>) => {
  const permissions = {} as PermissionsMap;
  for (const key of moduleKeys) {
    permissions[key] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
  }
  return { ...permissions, ...overrides };
};

describe('quickbooksPermissions', () => {
  it('allows connect when quickbooks connect action is granted', () => {
    const permissions = buildPermissions({
      quickbooks: {
        view: true,
        create: false,
        edit: false,
        delete: false,
        actions: ['connect', 'disconnect']
      }
    });
    expect(canQuickBooksConnect(permissions)).toBe(true);
  });

  it('allows manage connection when settings.edit and quickbooks.view are granted', () => {
    const permissions = buildPermissions({
      settings: { view: true, create: false, edit: true, delete: false, actions: [] },
      quickbooks: { view: true, create: false, edit: false, delete: false, actions: [] }
    });
    expect(canManageQuickBooksConnection(permissions)).toBe(true);
  });

  it('denies manage connection when only settings.view is granted', () => {
    const permissions = productPermissionsToLegacy(memberProductPermissions());
    expect(canManageQuickBooksConnection(permissions)).toBe(false);
  });

  it('does not use rolesSettings for settings integration control', () => {
    const permissions = buildPermissions({
      rolesSettings: { view: true, create: true, edit: true, delete: true, actions: [] },
      quickbooks: { view: true, create: false, edit: false, delete: false, actions: [] }
    });
    expect(canManageQuickBooksConnection(permissions)).toBe(false);
  });

  it('allows admin product permissions to connect and manage', () => {
    const permissions = productPermissionsToLegacy(adminProductPermissions());
    expect(canQuickBooksConnect(permissions)).toBe(true);
    expect(canManageQuickBooksConnection(permissions)).toBe(true);
  });
});
