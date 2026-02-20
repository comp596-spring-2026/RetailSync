import { Button } from '@mui/material';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import authReducer from '../features/auth/authSlice';
import companyReducer from '../features/company/companySlice';
import rbacReducer from '../features/rbac/rbacSlice';
import uiReducer from '../features/ui/uiSlice';
import type { RootState } from '../app/store';
import { PermissionGate } from './PermissionGate';

const buildPermissions = (): PermissionsMap =>
  moduleKeys.reduce((acc, key) => {
    acc[key] = {
      view: true,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
    return acc;
  }, {} as PermissionsMap);

const renderWithState = (permissions: PermissionsMap) => {
  const preloadedState: RootState = {
    auth: {
      accessToken: 'token',
      user: null,
      role: null,
      permissions,
      status: 'authenticated',
      error: null
    },
    company: { company: null },
    rbac: { modules: [], roles: [], selectedRole: null },
    ui: { open: false, message: '', severity: 'info' }
  };

  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    },
    preloadedState
  });

  return render(
    <Provider store={store}>
      <PermissionGate module="items" action="create">
        <Button>create item</Button>
      </PermissionGate>
    </Provider>
  );
};

describe('PermissionGate', () => {
  it('hides children when permission is not granted', () => {
    const permissions = buildPermissions();
    permissions.items!.create = false;

    renderWithState(permissions);

    expect(screen.queryByRole('button', { name: /create item/i })).not.toBeInTheDocument();
  });

  it('renders children when permission is granted', () => {
    const permissions = buildPermissions();
    permissions.items!.create = true;

    renderWithState(permissions);

    expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument();
  });
});
