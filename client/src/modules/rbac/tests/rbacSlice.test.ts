import { describe, expect, it } from 'vitest';
import { moduleKeys } from '@retailsync/shared';
import rbacReducer, { setModules, setRoles, setSelectedRole } from '../state/rbacSlice';

describe('rbacSlice', () => {
  it('updates modules catalog', () => {
    const next = rbacReducer(undefined, setModules([...moduleKeys]));
    expect(next.modules).toEqual(moduleKeys);
  });

  it('stores roles and selected role', () => {
    const basePermissions = moduleKeys.reduce((acc, key) => {
      acc[key] = { view: false, create: false, edit: false, delete: false, actions: [] };
      return acc;
    }, {} as Record<(typeof moduleKeys)[number], { view: boolean; create: boolean; edit: boolean; delete: boolean; actions: string[] }>);

    const roles = [
      {
        _id: 'role-1',
        name: 'Manager',
        isSystem: false,
        permissions: {
          ...basePermissions,
          dashboard: { view: true, create: false, edit: false, delete: false, actions: [] },
          pos: { view: true, create: true, edit: true, delete: false, actions: ['import'] },
          items: { view: true, create: true, edit: true, delete: true, actions: ['import'] },
          invoices: { view: true, create: true, edit: false, delete: false, actions: [] },
          inventory: { view: true, create: false, edit: true, delete: false, actions: ['move'] },
          locations: { view: true, create: true, edit: true, delete: false, actions: ['sync'] },
          suppliers: { view: true, create: false, edit: false, delete: false, actions: [] },
          users: { view: true, create: false, edit: false, delete: false, actions: ['invite'] },
          rolesSettings: { view: true, create: false, edit: false, delete: false, actions: [] }
        }
      }
    ];

    const withRoles = rbacReducer(undefined, setRoles(roles));
    const withSelection = rbacReducer(withRoles, setSelectedRole(roles[0]));

    expect(withRoles.roles).toHaveLength(1);
    expect(withSelection.selectedRole?._id).toBe('role-1');
  });
});
