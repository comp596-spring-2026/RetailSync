import { describe, expect, it } from 'vitest';
import {
  adminProductPermissions,
  clampPermissionsToActor,
  legacyPermissionsToProduct,
  memberProductPermissions,
  permissionsExceedActor,
  productPermissionsToLegacy,
  viewerProductPermissions
} from '@retailsync/shared';
import { adminPermissions, memberPermissions } from '../utils/defaultPermissions';

describe('productPermissions', () => {
  it('maps admin product capabilities to explicit legacy modules', () => {
    const legacy = productPermissionsToLegacy(adminProductPermissions());
    expect(legacy.settings.edit).toBe(true);
    expect(legacy.rolesSettings.create).toBe(true);
    expect(legacy.pos.actions).toEqual(expect.arrayContaining(['table', 'import']));
    expect(legacy.quickbooks.actions).toEqual(expect.arrayContaining(['connect', 'sync']));
  });

  it('round-trips member defaults without granting role admin or settings manage', () => {
    const legacy = memberPermissions();
    const product = legacyPermissionsToProduct(legacy);
    expect(product['access.roles.view']).toBe(false);
    expect(product['settings.manage']).toBe(false);
    expect(product['pos.import']).toBe(false);
    expect(product['accounting.statements.upload']).toBe(true);
  });

  it('rejects permissions above the actor', () => {
    const actor = memberPermissions();
    const candidate = adminPermissions();
    expect(permissionsExceedActor(candidate, actor)).toBe(true);
    const clamped = clampPermissionsToActor(candidate, actor);
    expect(legacyPermissionsToProduct(clamped)['access.roles.create']).toBe(false);
  });

  it('keeps viewer read-only', () => {
    const product = viewerProductPermissions();
    expect(product['accounting.statements.upload']).toBe(false);
    expect(product['quickbooks.sync']).toBe(false);
    expect(product['access.users.view']).toBe(false);
  });

  it('grants dashboard and settings visibility to all default system roles', () => {
    for (const template of [adminProductPermissions(), memberProductPermissions(), viewerProductPermissions()]) {
      expect(template['dashboard.show']).toBe(true);
      expect(template['settings.show']).toBe(true);
    }
  });

  it('maps dashboard.show to dashboard.view for custom role saves', () => {
    const legacy = productPermissionsToLegacy({
      ...memberProductPermissions(),
      'dashboard.show': true
    });
    expect(legacy.dashboard?.view).toBe(true);
  });
});
