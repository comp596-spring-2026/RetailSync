import { describe, expect, it, vi, beforeEach } from 'vitest';
import { memberPermissions } from '../utils/defaultPermissions';

const findOneMock = vi.fn();

vi.mock('../models/Role', () => ({
  RoleModel: {
    findOne: (...args: unknown[]) => findOneMock(...args)
  }
}));

import { requireQuickBooksDisconnect } from './requireQuickBooksDisconnect';

describe('requireQuickBooksDisconnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows roles with quickbooks disconnect action', async () => {
    const permissions = memberPermissions();
    permissions.quickbooks = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: ['disconnect']
    };

    findOneMock.mockResolvedValue({ name: 'QB Disconnect', isSystem: false, permissions });

    const req = { companyId: 'c1', roleId: 'r1' } as never;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
    const next = vi.fn();

    await requireQuickBooksDisconnect(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects quickbooks edit without disconnect or connect actions', async () => {
    const permissions = memberPermissions();
    permissions.quickbooks = {
      view: true,
      create: false,
      edit: true,
      delete: false,
      actions: ['post']
    };

    findOneMock.mockResolvedValue({ name: 'QB Poster', isSystem: false, permissions });

    const req = { companyId: 'c1', roleId: 'r1' } as never;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
    const next = vi.fn();

    await requireQuickBooksDisconnect(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
