import { describe, expect, it } from 'vitest';
import {
  canAssignMemberRole,
  canDeleteMember,
  canEditMember,
  isProtectedAdminMember,
  isProtectedAdminRole
} from './memberAccess';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';

const buildPermissions = (users: Partial<PermissionsMap['users']>) => {
  const permissions = {} as PermissionsMap;
  for (const key of moduleKeys) {
    permissions[key] = { view: false, create: false, edit: false, delete: false, actions: [] };
  }
  permissions.users = {
    view: false,
    create: false,
    edit: false,
    delete: false,
    actions: [],
    ...users
  };
  return permissions;
};

const adminMember = {
  _id: 'u1',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin@test.com',
  roleId: { _id: 'r-admin', name: 'Admin', isSystem: true }
};

describe('memberAccess', () => {
  it('detects protected admin role by isSystem and name', () => {
    expect(isProtectedAdminRole({ _id: 'r1', name: 'Admin', isSystem: true })).toBe(true);
    expect(isProtectedAdminRole({ _id: 'r2', name: 'Admin', isSystem: false })).toBe(false);
    expect(isProtectedAdminRole({ _id: 'r3', name: 'Manager', isSystem: true })).toBe(false);
  });

  it('blocks edit/delete/assign for protected admin member', () => {
    const permissions = buildPermissions({
      view: true,
      edit: true,
      delete: true,
      actions: ['assignRole']
    });

    expect(isProtectedAdminMember(adminMember)).toBe(true);
    expect(canEditMember(adminMember, { _id: 'u2' }, permissions)).toBe(false);
    expect(canDeleteMember(adminMember, { _id: 'u2' }, permissions)).toBe(false);
    expect(canAssignMemberRole(adminMember, { _id: 'u2' }, permissions)).toBe(false);
  });

  it('blocks self role assignment and delete', () => {
    const member = {
      _id: 'u2',
      firstName: 'Self',
      lastName: 'User',
      email: 'self@test.com',
      roleId: { _id: 'r2', name: 'Member', isSystem: false }
    };
    const permissions = buildPermissions({
      view: true,
      edit: true,
      delete: true,
      actions: ['assignRole']
    });

    expect(canAssignMemberRole(member, { _id: 'u2' }, permissions)).toBe(false);
    expect(canDeleteMember(member, { _id: 'u2' }, permissions)).toBe(false);
  });
});
