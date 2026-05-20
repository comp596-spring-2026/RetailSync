import { describe, expect, it, vi, beforeEach } from 'vitest';
import { memberProductPermissions, productPermissionsToLegacy } from '@retailsync/shared';
import { memberPermissions } from '../utils/defaultPermissions';

const findOneMock = vi.fn();
const existsMock = vi.fn();
const createMock = vi.fn();

vi.mock('../models/Role', () => ({
  RoleModel: {
    findOne: (...args: unknown[]) => findOneMock(...args),
    exists: (...args: unknown[]) => existsMock(...args),
    create: (...args: unknown[]) => createMock(...args)
  }
}));

vi.mock('../models/User', () => ({
  UserModel: { countDocuments: vi.fn() }
}));

import { createRole } from './roleController';

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
  } as never;
  return { res, status, json };
};

describe('roleController delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsMock.mockResolvedValue(null);
    createMock.mockImplementation(async (payload: unknown) => payload);
  });

  it('rejects role create when permissions exceed actor', async () => {
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        name: 'Member',
        isSystem: true,
        permissions: memberPermissions()
      })
    });

    const elevated = productPermissionsToLegacy({
      ...memberProductPermissions(),
      'access.users.assignRoles': true
    });

    const req = {
      companyId: 'company-1',
      roleId: 'role-member',
      body: { name: 'Elevated', permissions: elevated }
    } as never;
    const { res, status, json } = createResponse();

    await createRole(req, res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Cannot grant permissions you do not have.'
      })
    );
    expect(createMock).not.toHaveBeenCalled();
  });
});
