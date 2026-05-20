import type { Request, Response } from 'express';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { adminPermissions, memberPermissions } from '../utils/defaultPermissions';

const findOneMock = vi.fn();

vi.mock('../models/Role', () => ({
  RoleModel: {
    findOne: (...args: unknown[]) => findOneMock(...args)
  }
}));

import { requireAnyPermission } from './requireAnyPermission';

describe('requireAnyPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows settings editors without POS import to pass mapping validation gates', async () => {
    const permissions = memberPermissions();
    permissions.settings = {
      view: true,
      create: false,
      edit: true,
      delete: false,
      actions: []
    };
    permissions.pos = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };

    findOneMock.mockResolvedValue({
      name: 'Settings Manager',
      isSystem: false,
      permissions
    });

    const middleware = requireAnyPermission([
      { moduleKey: 'settings', action: 'edit' },
      { moduleKey: 'pos', action: 'import' }
    ]);

    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows POS importers without settings edit', async () => {
    const permissions = memberPermissions();
    permissions.pos = {
      view: true,
      create: true,
      edit: false,
      delete: false,
      actions: ['import', 'table', 'analytics', 'saleTax']
    };

    findOneMock.mockResolvedValue({
      name: 'POS Operator',
      isSystem: false,
      permissions
    });

    const middleware = requireAnyPermission([
      { moduleKey: 'settings', action: 'edit' },
      { moduleKey: 'pos', action: 'import' }
    ]);

    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('allows bank statement editors to use QuickBooks hub read APIs', async () => {
    const permissions = memberPermissions();
    permissions.bankStatements = {
      view: true,
      create: false,
      edit: true,
      delete: false,
      actions: []
    };
    permissions.quickbooks = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };

    findOneMock.mockResolvedValue({
      name: 'Statement Reviewer',
      isSystem: false,
      permissions
    });

    const middleware = requireAnyPermission([
      { moduleKey: 'quickbooks', action: 'view' },
      { moduleKey: 'bankStatements', action: 'view' },
      { moduleKey: 'bankStatements', action: 'edit' }
    ]);

    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects when neither permission is granted', async () => {
    const permissions = memberPermissions();
    permissions.rolesSettings = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
    permissions.pos = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };

    findOneMock.mockResolvedValue({
      name: 'Viewer',
      isSystem: false,
      permissions
    });

    const middleware = requireAnyPermission([
      { moduleKey: 'settings', action: 'edit' },
      { moduleKey: 'pos', action: 'import' }
    ]);

    const statusMock = vi.fn().mockReturnThis();
    const req = { companyId: 'c1', roleId: 'r1' } as unknown as Request;
    const res = { status: statusMock, json: vi.fn() } as unknown as Response;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
  });
});
