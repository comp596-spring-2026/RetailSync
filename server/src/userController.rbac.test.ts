import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  roleFindOneMock,
  userFindOneMock,
  userFindOneAndUpdateMock,
  assertNotRemovingLastAdminMock,
  assertMemberRoleChangeAllowedMock
} = vi.hoisted(() => ({
  roleFindOneMock: vi.fn(),
  userFindOneMock: vi.fn(),
  userFindOneAndUpdateMock: vi.fn(),
  assertNotRemovingLastAdminMock: vi.fn(),
  assertMemberRoleChangeAllowedMock: vi.fn()
}));

vi.mock('./models/Role', () => ({
  RoleModel: {
    findOne: (...args: unknown[]) => roleFindOneMock(...args)
  }
}));

vi.mock('./models/User', () => ({
  UserModel: {
    find: vi.fn(),
    findOne: (...args: unknown[]) => userFindOneMock(...args),
    findOneAndUpdate: (...args: unknown[]) => userFindOneAndUpdateMock(...args)
  }
}));

vi.mock('./utils/adminRoleGuard', () => ({
  assertNotRemovingLastAdmin: (...args: unknown[]) => assertNotRemovingLastAdminMock(...args)
}));

vi.mock('./utils/memberGuards', async () => {
  const actual = await vi.importActual<typeof import('./utils/memberGuards')>('./utils/memberGuards');
  return {
    ...actual,
    assertMemberRoleChangeAllowed: (...args: unknown[]) => assertMemberRoleChangeAllowedMock(...args),
    assertNotDeletingLastAdmin: (...args: unknown[]) => assertNotRemovingLastAdminMock(...args)
  };
});

const createResponse = () => {
  const status = vi.fn();
  const json = vi.fn();
  const res = {
    status: (code: number) => {
      status(code);
      return res;
    },
    json: (payload: unknown) => {
      json(payload);
      return res;
    }
  } as unknown as Response;
  return { res, status, json };
};

describe('userController RBAC safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertNotRemovingLastAdminMock.mockResolvedValue(null);
    assertMemberRoleChangeAllowedMock.mockResolvedValue(null);
  });

  it('rejects self role assignment when ids match as strings', async () => {
    const { assignUserRole } = await import('./controllers/userController');
    const { res, status, json } = createResponse();

    await assignUserRole(
      {
        companyId: 'company-1',
        user: { id: 'user-1' },
        params: { id: 'user-1' },
        body: { roleId: 'role-2' }
      } as unknown as Request,
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You cannot change your own role.' })
    );
    expect(roleFindOneMock).not.toHaveBeenCalled();
  });

  it('rejects removing the last admin via role change', async () => {
    const { assignUserRole } = await import('./controllers/userController');
    assertMemberRoleChangeAllowedMock.mockResolvedValue('Cannot remove the last admin from the company.');
    roleFindOneMock.mockResolvedValue({
      _id: { toString: () => 'role-member' },
      name: 'Member'
    });
    userFindOneMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockResolvedValue({
        _id: { toString: () => 'user-2' },
        roleId: { _id: { toString: () => 'role-admin' }, isSystem: true, name: 'Admin' }
      })
    });

    const { res, status, json } = createResponse();
    await assignUserRole(
      {
        companyId: 'company-1',
        user: { id: 'user-1' },
        params: { id: 'user-2' },
        body: { roleId: 'role-member' }
      } as unknown as Request,
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Cannot remove the last admin from the company.' })
    );
    expect(userFindOneAndUpdateMock).not.toHaveBeenCalled();
  });

  it('rejects protected admin member update', async () => {
    const { updateUser } = await import('./controllers/userController');
    userFindOneMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockResolvedValue({
        _id: { toString: () => 'user-admin' },
        roleId: { isSystem: true, name: 'Admin' }
      })
    });

    const { res, status, json } = createResponse();
    await updateUser(
      {
        companyId: 'company-1',
        params: { id: 'user-admin' },
        body: { firstName: 'New', lastName: 'Name' }
      } as unknown as Request,
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Protected admin account cannot be edited or removed.' })
    );
  });

  it('rejects self delete', async () => {
    const { deleteUser } = await import('./controllers/userController');
    const { res, status, json } = createResponse();

    await deleteUser(
      {
        companyId: 'company-1',
        user: { id: 'user-1' },
        params: { id: 'user-1' }
      } as unknown as Request,
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You cannot remove your own account.' })
    );
  });

  it('rejects protected admin delete', async () => {
    const { deleteUser } = await import('./controllers/userController');
    userFindOneMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockResolvedValue({
        _id: { toString: () => 'user-admin' },
        isActive: true,
        roleId: { isSystem: true, name: 'Admin' }
      })
    });

    const { res, status, json } = createResponse();
    await deleteUser(
      {
        companyId: 'company-1',
        user: { id: 'user-1' },
        params: { id: 'user-admin' }
      } as unknown as Request,
      res
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Protected admin account cannot be edited or removed.' })
    );
  });
});
