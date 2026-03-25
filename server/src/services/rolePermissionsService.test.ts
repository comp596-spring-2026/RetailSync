import { describe, expect, it } from 'vitest';
import { moduleKeys } from '@retailsync/shared';
import { memberPermissions } from '../utils/defaultPermissions';
import {
  findMissingPermissionModules,
  normalizeRolePermissions,
  rolePermissionsNeedBackfill
} from './rolePermissionsService';

const makeLegacyMemberPermissions = () => {
  const permissions = memberPermissions() as Record<string, unknown>;
  delete permissions.accounting;
  delete permissions.ledger;
  delete permissions.quickbooks;
  return permissions;
};

describe('rolePermissionsService', () => {
  it('normalizes legacy system roles to current module keys', () => {
    const normalized = normalizeRolePermissions(makeLegacyMemberPermissions(), {
      roleName: 'Member',
      isSystem: true
    });

    expect(Object.keys(normalized).sort()).toEqual([...moduleKeys].sort());
    expect(normalized.accounting).toEqual(memberPermissions().accounting);
    expect(normalized.ledger).toEqual(memberPermissions().ledger);
    expect(normalized.quickbooks).toEqual(memberPermissions().quickbooks);
  });

  it('detects the legacy accounting-related modules that need backfill', () => {
    const legacyPermissions = makeLegacyMemberPermissions();

    expect(findMissingPermissionModules(legacyPermissions)).toEqual([
      'accounting',
      'ledger',
      'quickbooks'
    ]);
    expect(rolePermissionsNeedBackfill(legacyPermissions)).toBe(true);
  });

  it('is idempotent when re-normalizing already-correct permissions', () => {
    const firstPass = normalizeRolePermissions(makeLegacyMemberPermissions(), {
      roleName: 'Member',
      isSystem: true
    });
    const secondPass = normalizeRolePermissions(firstPass, {
      roleName: 'Member',
      isSystem: true
    });

    expect(secondPass).toEqual(firstPass);
    expect(rolePermissionsNeedBackfill(secondPass)).toBe(false);
    expect(findMissingPermissionModules(secondPass)).toEqual([]);
  });
});
