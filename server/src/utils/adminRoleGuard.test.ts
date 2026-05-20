import { beforeEach, describe, expect, it, vi } from 'vitest';

const { roleFindMock, userCountDocumentsMock } = vi.hoisted(() => ({
  roleFindMock: vi.fn(),
  userCountDocumentsMock: vi.fn()
}));

vi.mock('../models/Role', () => ({
  RoleModel: {
    find: (...args: unknown[]) => roleFindMock(...args)
  }
}));

vi.mock('../models/User', () => ({
  UserModel: {
    countDocuments: (...args: unknown[]) => userCountDocumentsMock(...args)
  }
}));

describe('adminRoleGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks demoting the only admin', async () => {
    const { assertNotRemovingLastAdmin } = await import('./adminRoleGuard');
    roleFindMock.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: 'role-admin', name: 'Admin', isSystem: true },
          { _id: 'role-member', name: 'Member', isSystem: true }
        ])
    });
    userCountDocumentsMock.mockResolvedValue(1);

    const message = await assertNotRemovingLastAdmin({
      companyId: 'company-1',
      userId: 'user-1',
      currentRoleId: 'role-admin',
      nextRoleId: 'role-member'
    });

    expect(message).toBe('Cannot remove the last admin from the company.');
  });

  it('ignores a custom non-system role named Admin', async () => {
    const { assertNotRemovingLastAdmin } = await import('./adminRoleGuard');
    roleFindMock.mockReturnValue({
      lean: () =>
        Promise.resolve([
          { _id: 'role-admin', name: 'Admin', isSystem: true },
          { _id: 'role-custom-admin', name: 'Admin', isSystem: false }
        ])
    });
    userCountDocumentsMock.mockResolvedValue(1);

    const message = await assertNotRemovingLastAdmin({
      companyId: 'company-1',
      userId: 'user-1',
      currentRoleId: 'role-custom-admin',
      nextRoleId: 'role-member'
    });

    expect(message).toBeNull();
  });

  it('allows demoting an admin when another admin remains', async () => {
    const { assertNotRemovingLastAdmin } = await import('./adminRoleGuard');
    roleFindMock.mockReturnValue({
      lean: () =>
        Promise.resolve([{ _id: 'role-admin', name: 'Admin', isSystem: true }])
    });
    userCountDocumentsMock.mockResolvedValue(2);

    const message = await assertNotRemovingLastAdmin({
      companyId: 'company-1',
      userId: 'user-1',
      currentRoleId: 'role-admin',
      nextRoleId: 'role-member'
    });

    expect(message).toBeNull();
  });
});
