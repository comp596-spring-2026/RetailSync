import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { describe, expect, it } from 'vitest';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { ProcurementHubPage } from './ProcurementHubPage';

const buildPermissions = (): PermissionsMap =>
  moduleKeys.reduce((acc, moduleKey) => {
    acc[moduleKey] = {
      view: moduleKey === 'invoices' || moduleKey === 'suppliers',
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
    return acc;
  }, {} as PermissionsMap);

const createStore = () => {
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
        _id: 'user-1',
        firstName: 'Procurement',
        lastName: 'Tester',
        email: 'procurement@example.com',
        companyId: 'company-1',
        roleId: 'role-1'
      },
      role: null,
      permissions: buildPermissions()
    })
  );

  return store;
};

describe('ProcurementHubPage', () => {
  it('renders procurement tabs and switches to suppliers view', async () => {
    const user = userEvent.setup();

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ProcurementHubPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('Procurement')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invoices' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Suppliers' }));
    expect(screen.getByRole('heading', { name: 'Suppliers' })).toBeInTheDocument();
  });
});
