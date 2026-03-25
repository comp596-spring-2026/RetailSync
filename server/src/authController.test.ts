import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleKeys } from '@retailsync/shared';
import { memberPermissions } from './utils/defaultPermissions';

const {
  userFindByIdMock,
  companyFindByIdMock,
  roleFindByIdMock
} = vi.hoisted(() => ({
  userFindByIdMock: vi.fn(),
  companyFindByIdMock: vi.fn(),
  roleFindByIdMock: vi.fn()
}));

vi.mock('./models/User', () => ({
  UserModel: {
    findById: (...args: unknown[]) => userFindByIdMock(...args)
  }
}));

vi.mock('./models/Company', () => ({
  CompanyModel: {
    findById: (...args: unknown[]) => companyFindByIdMock(...args)
  }
}));

vi.mock('./models/Role', () => ({
  RoleModel: {
    findById: (...args: unknown[]) => roleFindByIdMock(...args)
  }
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

describe('authController me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns normalized current module keys for legacy system roles', async () => {
    const { me } = await import('./controllers/authController');
    const legacyPermissions = memberPermissions() as Record<string, unknown>;
    delete legacyPermissions.accounting;
    delete legacyPermissions.ledger;
    delete legacyPermissions.quickbooks;

    userFindByIdMock.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'user-1',
          firstName: 'Legacy',
          lastName: 'User',
          email: 'legacy@example.com',
          companyId: 'company-1',
          roleId: 'role-1'
        })
      })
    });
    companyFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'company-1',
        name: 'RetailSync'
      })
    });
    roleFindByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: 'role-1',
        name: 'Member',
        isSystem: true,
        permissions: legacyPermissions
      })
    });

    const req = {
      user: {
        id: 'user-1'
      }
    } as unknown as Request;
    const { res, status, json } = createResponse();

    await me(req, res);

    expect(status).toHaveBeenCalledWith(200);
    const payload = json.mock.calls[0]?.[0] as {
      data: {
        permissions: Record<string, unknown>;
      };
    };
    expect(Object.keys(payload.data.permissions).sort()).toEqual([...moduleKeys].sort());
    expect(payload.data.permissions.accounting).toEqual(memberPermissions().accounting);
    expect(payload.data.permissions.ledger).toEqual(memberPermissions().ledger);
    expect(payload.data.permissions.quickbooks).toEqual(memberPermissions().quickbooks);
  });
});
