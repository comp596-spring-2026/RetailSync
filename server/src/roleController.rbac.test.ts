import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { roleFindOneMock, roleExistsMock, roleCreateMock, userCountDocumentsMock } = vi.hoisted(() => ({
  roleFindOneMock: vi.fn(),
  roleExistsMock: vi.fn(),
  roleCreateMock: vi.fn(),
  userCountDocumentsMock: vi.fn()
}));

vi.mock('./models/Role', () => ({
  RoleModel: {
    find: vi.fn(),
    findOne: (...args: unknown[]) => roleFindOneMock(...args),
    exists: (...args: unknown[]) => roleExistsMock(...args),
    create: (...args: unknown[]) => roleCreateMock(...args)
  }
}));

vi.mock('./models/User', () => ({
  UserModel: {
    countDocuments: (...args: unknown[]) => userCountDocumentsMock(...args)
  }
}));

vi.mock('./services/rolePermissionsService', () => ({
  normalizeRolePermissions: (permissions: unknown) => permissions
}));

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

const baseReq = {
  companyId: 'company-1',
  body: { name: 'Custom', permissions: {} }
} as Request;

describe('roleController RBAC safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects updating a system role', async () => {
    const { updateRole } = await import('./controllers/roleController');
    roleFindOneMock.mockResolvedValue({
      _id: 'role-admin',
      name: 'Admin',
      isSystem: true,
      permissions: {},
      save: vi.fn()
    });

    const { res, status, json } = createResponse();
    await updateRole({ ...baseReq, params: { id: 'role-admin' } } as unknown as Request, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'System roles are read-only.' })
    );
  });

  it('rejects deleting a role with assigned users', async () => {
    const { deleteRole } = await import('./controllers/roleController');
    const deleteOne = vi.fn();
    roleFindOneMock.mockResolvedValue({
      _id: 'role-custom',
      name: 'Custom',
      isSystem: false,
      deleteOne
    });
    userCountDocumentsMock.mockResolvedValue(2);

    const { res, status, json } = createResponse();
    await deleteRole({ ...baseReq, params: { id: 'role-custom' } } as unknown as Request, res);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Cannot delete this role because users are assigned to it. Reassign users first.'
      })
    );
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
