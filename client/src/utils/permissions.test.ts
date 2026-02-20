import { describe, expect, it } from 'vitest';
import { PermissionsMap, moduleKeys } from '@retailsync/shared';
import { hasPermission } from './permissions';

const buildPermissions = (): PermissionsMap => {
  return moduleKeys.reduce((acc, key) => {
    acc[key] = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
    return acc;
  }, {} as PermissionsMap);
};

describe('hasPermission', () => {
  it('returns true for enabled CRUD action', () => {
    const permissions = buildPermissions();
    permissions.inventory!.create = true;

    expect(hasPermission(permissions, 'inventory', 'create')).toBe(true);
  });

  it('returns true for explicit custom action', () => {
    const permissions = buildPermissions();
    permissions.invoices!.actions = ['confirm'];

    expect(hasPermission(permissions, 'invoices', 'actions:confirm')).toBe(true);
    expect(hasPermission(permissions, 'invoices', 'actions:export')).toBe(false);
  });

  it('returns true for wildcard custom action', () => {
    const permissions = buildPermissions();
    permissions.reports!.actions = ['*'];

    expect(hasPermission(permissions, 'reports', 'actions:export_csv')).toBe(true);
  });
});
