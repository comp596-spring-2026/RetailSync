import { describe, expect, it } from 'vitest';
import { sanitizeModulePermissionSet } from '@retailsync/shared';

describe('moduleCapabilities', () => {
  it('preserves wildcard actions for admin-style grants', () => {
    const sanitized = sanitizeModulePermissionSet('users', {
      view: true,
      create: false,
      edit: true,
      delete: true,
      actions: ['*']
    });

    expect(sanitized.actions).toEqual(['*']);
  });

  it('strips unsupported dashboard create/edit/delete flags', () => {
    const sanitized = sanitizeModulePermissionSet('dashboard', {
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['refresh', 'invalid']
    });

    expect(sanitized).toEqual({
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: ['refresh']
    });
  });
});
