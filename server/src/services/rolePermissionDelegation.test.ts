import { describe, expect, it } from 'vitest';
import {
  ROLE_DELEGATION_FORBIDDEN_MESSAGE,
  memberProductPermissions,
  productPermissionsToLegacy
} from '@retailsync/shared';
import { adminPermissions, memberPermissions } from '../utils/defaultPermissions';
import { assertRolePermissionsWithinActor } from './rolePermissionDelegation';

describe('rolePermissionDelegation', () => {
  it('throws when candidate permissions exceed actor', () => {
    expect(() => assertRolePermissionsWithinActor(adminPermissions(), memberPermissions())).toThrow(
      ROLE_DELEGATION_FORBIDDEN_MESSAGE
    );
  });

  it('allows subset permissions', () => {
    const actor = adminPermissions();
    const candidate = memberPermissions();
    expect(() => assertRolePermissionsWithinActor(candidate, actor)).not.toThrow();
  });

  it('blocks granting assignRoles without actor grant', () => {
    const actor = memberPermissions();
    const elevated = productPermissionsToLegacy({
      ...memberProductPermissions(),
      'access.users.assignRoles': true
    });
    expect(() => assertRolePermissionsWithinActor(elevated, actor)).toThrow(
      ROLE_DELEGATION_FORBIDDEN_MESSAGE
    );
  });
});
