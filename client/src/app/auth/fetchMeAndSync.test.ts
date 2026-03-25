import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import authReducer from '../../modules/auth/state';
import companyReducer from '../../modules/users/state';
import rbacReducer from '../../modules/rbac/state';
import uiReducer from '../../app/store/uiSlice';
import { setAuthContext } from '../../modules/auth/state';
import { fetchMeAndSync } from './fetchMeAndSync';

const mockMe = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    me: (...args: unknown[]) => mockMe(...args)
  }
}));

describe('fetchMeAndSync', () => {
  const createStalePermissions = () => ({
    items: { view: true, create: false, edit: false, delete: false, actions: [] }
  }) as PermissionsMap;

  const createCurrentPermissions = () => {
    const permissions = {} as PermissionsMap;
    for (const moduleKey of moduleKeys) {
      permissions[moduleKey] = {
        view: moduleKey !== 'rolesSettings',
        create: false,
        edit: false,
        delete: false,
        actions: []
      };
    }
    if (permissions.quickbooks) {
      permissions.quickbooks.actions = ['connect', 'sync'];
    }
    return permissions;
  };

  it('calls authApi.me(), dispatches setAuthContext and setCompany, and returns me data', async () => {
    const meData = {
      user: {
        _id: 'u1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        companyId: 'c1',
        roleId: 'r1'
      },
      role: {
        _id: 'r1',
        name: 'Admin',
        isSystem: false,
        permissions: { items: { view: true, create: true, edit: true, delete: true, actions: [] } }
      },
      permissions: { items: { view: true, create: true, edit: true, delete: true, actions: [] } },
      company: {
        _id: 'c1',
        name: 'Acme',
        code: 'ACM',
        businessType: 'Retail',
        address: '1 Main St',
        phone: '555',
        email: 'acme@example.com',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      }
    };

    mockMe.mockResolvedValue({ data: { data: meData } });

    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer,
        rbac: rbacReducer,
        ui: uiReducer
      }
    });

    const result = await fetchMeAndSync(store.dispatch);

    expect(mockMe).toHaveBeenCalledTimes(1);
    expect(result).toEqual(meData);

    const state = store.getState();
    expect(state.auth.user).toEqual(meData.user);
    expect(state.auth.role).toEqual(meData.role);
    expect(state.auth.permissions).toEqual(meData.permissions);
    expect(state.company.company).toEqual(meData.company);
  });

  it('dispatches company as null when me response has no company', async () => {
    const meData = {
      user: {
        _id: 'u1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        companyId: null,
        roleId: null
      },
      role: null,
      permissions: null,
      company: null
    };

    mockMe.mockResolvedValue({ data: { data: meData } });

    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer,
        rbac: rbacReducer,
        ui: uiReducer
      }
    });

    const result = await fetchMeAndSync(store.dispatch);

    expect(result.company).toBeNull();
    expect(store.getState().company.company).toBeNull();
  });

  it('replaces stale persisted permissions with the current /auth/me payload during bootstrap', async () => {
    const currentPermissions = createCurrentPermissions();
    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer,
        rbac: rbacReducer,
        ui: uiReducer
      }
    });

    store.dispatch(
      setAuthContext({
        user: {
          _id: 'u-stale',
          firstName: 'Stale',
          lastName: 'User',
          email: 'stale@example.com',
          companyId: 'c1',
          roleId: 'r1'
        },
        role: null,
        permissions: createStalePermissions()
      })
    );

    mockMe.mockResolvedValue({
      data: {
        data: {
          user: {
            _id: 'u-stale',
            firstName: 'Fresh',
            lastName: 'User',
            email: 'fresh@example.com',
            companyId: 'c1',
            roleId: 'r1'
          },
          role: {
            _id: 'r1',
            name: 'Member',
            isSystem: true,
            permissions: currentPermissions
          },
          permissions: currentPermissions,
          company: {
            _id: 'c1',
            name: 'Acme',
            code: 'ACM',
            businessType: 'Retail',
            address: '1 Main St',
            phone: '555',
            email: 'acme@example.com',
            timezone: 'America/New_York',
            currency: 'USD'
          }
        }
      }
    });

    await fetchMeAndSync(store.dispatch);

    expect(store.getState().auth.permissions).toEqual(currentPermissions);
    expect(store.getState().auth.permissions?.quickbooks?.actions).toEqual(['connect', 'sync']);
    expect(store.getState().auth.permissions?.accounting?.view).toBe(true);
  });
});
