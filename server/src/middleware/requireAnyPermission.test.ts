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

    const req = { companyId: 'c1', roleId: 'r1' } as never;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
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

    const req = { companyId: 'c1', roleId: 'r1' } as never;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
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

    const req = { companyId: 'c1', roleId: 'r1' } as never;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as never;
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
