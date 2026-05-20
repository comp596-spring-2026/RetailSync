import { Button } from '@mui/material';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import authReducer from '../modules/auth/state';
import companyReducer from '../modules/users/state';
import rbacReducer from '../modules/rbac/state';
import uiReducer from '../app/store/uiSlice';
import { PermissionGate } from '../app/guards';

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
  const preloadedState = {
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
  } as any;

  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    } as any,
    preloadedState
  });

  return render(
    <Provider store={store}>
      <PermissionGate module="bankStatements" action="create">
        <Button>upload statement</Button>
      </PermissionGate>
    </Provider>
  );
};

describe('PermissionGate', () => {
  it('hides children when permission is not granted', () => {
    const permissions = buildPermissions();
    permissions.bankStatements!.create = false;

    renderWithState(permissions);

    expect(screen.queryByRole('button', { name: /upload statement/i })).not.toBeInTheDocument();
  });

  it('renders children when permission is granted', () => {
    const permissions = buildPermissions();
    permissions.bankStatements!.create = true;

    renderWithState(permissions);

    expect(screen.getByRole('button', { name: /upload statement/i })).toBeInTheDocument();
  });
});
