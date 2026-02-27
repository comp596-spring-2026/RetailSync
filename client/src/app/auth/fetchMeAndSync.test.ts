import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';
import authReducer from '../../slices/auth/authSlice';
import companyReducer from '../../slices/company/companySlice';
import rbacReducer from '../../slices/rbac/rbacSlice';
import uiReducer from '../../slices/ui/uiSlice';
import { fetchMeAndSync } from './fetchMeAndSync';

const mockMe = vi.fn();

vi.mock('../../api', () => ({
  authApi: {
    me: (...args: unknown[]) => mockMe(...args)
  }
}));

describe('fetchMeAndSync', () => {
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
});
