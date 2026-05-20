import type { Request, Response } from 'express';
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

    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
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

    const statusMock = vi.fn().mockReturnThis();
    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: statusMock, json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await requireQuickBooksDisconnect(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
  });
});
