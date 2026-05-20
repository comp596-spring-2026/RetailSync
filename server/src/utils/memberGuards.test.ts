import { describe, expect, it } from 'vitest';
import { isProtectedAdminMember, isProtectedAdminRole } from './memberGuards';

describe('memberGuards', () => {
  it('identifies protected admin role using isSystem and admin name', () => {
    expect(isProtectedAdminRole({ isSystem: true, name: 'Admin' })).toBe(true);
    expect(isProtectedAdminRole({ isSystem: true, name: 'admin' })).toBe(true);
    expect(isProtectedAdminRole({ isSystem: false, name: 'Admin' })).toBe(false);
    expect(isProtectedAdminRole({ isSystem: true, name: 'Manager' })).toBe(false);
  });

  it('identifies protected admin member from populated role', () => {
    expect(
      isProtectedAdminMember({
        roleId: { isSystem: true, name: 'Admin' }
      })
    ).toBe(true);
    expect(
      isProtectedAdminMember({
        roleId: { isSystem: false, name: 'Admin' }
      })
    ).toBe(false);
  });
});
