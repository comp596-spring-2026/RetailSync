import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import authReducer from '../../modules/auth/state';
import companyReducer from '../../modules/users/state/companySlice';
import { DashboardLayout } from './DashboardLayout';

vi.mock('../../modules/auth/state', async () => {
  const actual = await vi.importActual<typeof import('../../modules/auth/state')>('../../modules/auth/state');
  return {
    ...actual,
    logoutThunk: () => ({ type: 'auth/logout/mock' })
  };
});

const buildPermissions = (settingsView: boolean) => {
  const permissions = {} as PermissionsMap;
  for (const key of moduleKeys) {
    permissions[key] = {
      view: key === 'dashboard' ? true : false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
  }
  permissions.settings = {
    view: settingsView,
    create: false,
    edit: false,
    delete: false,
    actions: []
  };
  return permissions;
};

describe('DashboardLayout settings nav', () => {
  it('hides Settings nav when the user lacks settings.view', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer
      } as never,
      preloadedState: {
        auth: {
          accessToken: 'token',
          user: { _id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', companyId: 'c1', roleId: 'r1' },
          role: null,
          permissions: buildPermissions(false),
          status: 'authenticated',
          error: null,
          loggingOut: false,
          isRehydrated: true,
          isContextReady: true,
          isSyncingContext: false
        },
        company: { company: { name: 'Co' } }
      } as never
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.queryByRole('link', { name: /^settings$/i })).not.toBeInTheDocument();
  });

  it('shows Settings nav when settings.view is granted', () => {
    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer
      } as never,
      preloadedState: {
        auth: {
          accessToken: 'token',
          user: { _id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', companyId: 'c1', roleId: 'r1' },
          role: null,
          permissions: buildPermissions(true),
          status: 'authenticated',
          error: null,
          loggingOut: false,
          isRehydrated: true,
          isContextReady: true,
          isSyncingContext: false
        },
        company: { company: { name: 'Co' } }
      } as never
    });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByRole('link', { name: /^settings$/i })).toBeInTheDocument();
  });
});
