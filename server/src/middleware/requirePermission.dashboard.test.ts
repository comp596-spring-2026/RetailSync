import type { Request, Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { memberPermissions } from '../utils/defaultPermissions';

const findOneMock = vi.fn();

vi.mock('../models/Role', () => ({
  RoleModel: {
    findOne: (...args: unknown[]) => findOneMock(...args)
  }
}));

import { requirePermission } from './requirePermission';

describe('requirePermission dashboard.view', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows dashboard.view', async () => {
    const permissions = memberPermissions();
    permissions.dashboard = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };

    findOneMock.mockResolvedValue({ name: 'Member', isSystem: true, permissions });

    const middleware = requirePermission('dashboard', 'view');
    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects without dashboard.view', async () => {
    const permissions = memberPermissions();
    permissions.dashboard = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };

    findOneMock.mockResolvedValue({ name: 'Custom', isSystem: false, permissions });

    const middleware = requirePermission('dashboard', 'view');
    const statusMock = vi.fn().mockReturnThis();
    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: statusMock, json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
  });
});
