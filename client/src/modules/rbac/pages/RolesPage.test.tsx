import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adminProductPermissions,
  moduleKeys,
  PermissionsMap,
  productPermissionsToLegacy
} from '@retailsync/shared';
import authReducer from '../../auth/state';
import companyReducer from '../../users/state/companySlice';
import rbacReducer from '../state/rbacSlice';
import uiReducer from '../../../app/store/uiSlice';
import { RolesPage } from './RolesPage';

const dispatchMock = vi.fn();

vi.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(storeRef.current.getState())
}));

const storeRef: { current: ReturnType<typeof configureStore> } = {
  current: configureStore({ reducer: { auth: authReducer } })
};

const buildPermissions = (rolesSettings: Partial<PermissionsMap['rolesSettings']>) => {
  const permissions = {} as PermissionsMap;
  for (const key of moduleKeys) {
    permissions[key] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
  }
  permissions.rolesSettings = {
    view: false,
    create: false,
    edit: false,
    delete: false,
    actions: [],
    ...rolesSettings
  };
  return permissions;
};

const adminPermissions = productPermissionsToLegacy(adminProductPermissions());
const viewOnlyPermissions = buildPermissions({ view: true });

const systemRoles = [
  { _id: 'role-admin', name: 'Admin', isSystem: true, permissions: adminPermissions },
  { _id: 'role-member', name: 'Member', isSystem: true, permissions: adminPermissions },
  { _id: 'role-viewer', name: 'Viewer', isSystem: true, permissions: adminPermissions },
  { _id: 'role-custom', name: 'Custom', isSystem: false, permissions: adminPermissions }
];

const selectRoleFromDropdown = async (roleId: string) => {
  fireEvent.mouseDown(screen.getByRole('combobox'));
  fireEvent.click(await screen.findByTestId(`role-option-${roleId}`));
};

const renderPage = (permissions: PermissionsMap, roles = systemRoles) => {
  storeRef.current = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    } as never,
    preloadedState: {
      auth: {
        accessToken: 'token',
        user: null,
        role: null,
        permissions,
        status: 'authenticated',
        error: null,
        loggingOut: false,
        isRehydrated: true,
        isContextReady: true,
        isSyncingContext: false
      },
      company: { company: null },
      rbac: {
        modules: [...moduleKeys],
        roles: roles as never[],
        selectedRole: null,
        loading: false,
        mutating: false,
        error: null
      },
      ui: { open: false, message: '', severity: 'info' }
    } as never
  });

  return render(
    <Provider store={storeRef.current}>
      <RolesPage showHeader={false} />
    </Provider>
  );
};

describe('RolesPage layout and RBAC gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows role dropdown at top and no legacy role library sidebar', () => {
    renderPage(adminPermissions);

    expect(screen.getByTestId('role-select')).toBeInTheDocument();
    expect(screen.queryByText('Role library')).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-list-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-list-role-admin')).not.toBeInTheDocument();
  });

  it('creates a custom role even when a system role was previously selected', async () => {
    dispatchMock.mockImplementation((action: { type?: string }) => {
      if (typeof action === 'function') {
        return Promise.resolve({ _id: 'role-new', name: 'Manager', isSystem: false, permissions: adminPermissions });
      }
      if (action?.type === 'rbac/saveRole/fulfilled') {
        return Promise.resolve(action);
      }
      return Promise.resolve(action);
    });

    renderPage(adminPermissions);

    await selectRoleFromDropdown('role-admin');
    fireEvent.click(screen.getByTestId('create-role-btn'));
    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Manager' } });
    fireEvent.click(screen.getByTestId('role-create-submit'));

    await waitFor(() => {
      expect(dispatchMock).toHaveBeenCalled();
    });
  });

  it('shows new role button and opens create mode with inline create action', async () => {
    renderPage(adminPermissions);

    fireEvent.click(screen.getByTestId('create-role-btn'));

    expect(screen.queryByTestId('role-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('roles-workspace-card')).toBeInTheDocument();
    expect(screen.getByTestId('role-create-submit')).toBeInTheDocument();
    expect(screen.getByTestId('role-create-submit')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Role name'), { target: { value: 'Manager' } });
    expect(screen.getByTestId('role-create-submit')).not.toBeDisabled();
    expect(screen.queryByTestId('role-save-btn')).not.toBeInTheDocument();
  });

  it('returns to dropdown mode when cancel is clicked', () => {
    renderPage(adminPermissions);

    fireEvent.click(screen.getByTestId('create-role-btn'));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(screen.getByTestId('role-select')).toBeInTheDocument();
    expect(screen.getByTestId('role-select')).toBeInTheDocument();
  });

  it('loads permissions when selecting a role from the dropdown', async () => {
    renderPage(adminPermissions);

    await selectRoleFromDropdown('role-custom');

    await waitFor(() => {
      expect(screen.getByLabelText('Import POS Data')).toBeInTheDocument();
    });
  });

  it('shows dashboard as always-on and read-only', () => {
    renderPage(adminPermissions);

    const dashboard = screen.getByLabelText('Dashboard');
    expect(dashboard).toBeChecked();
    expect(dashboard).toBeDisabled();
    expect(screen.getByText('Available to all users')).toBeInTheDocument();
    expect(screen.queryByLabelText('Show Dashboard')).not.toBeInTheDocument();
  });

  it('shows system role as read-only without save button', async () => {
    renderPage(adminPermissions);

    await selectRoleFromDropdown('role-admin');

    expect(screen.queryByText(/^Permissions$/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-save-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('role-delete-btn')).not.toBeInTheDocument();
  });

  it('shows save changes for editable custom roles', async () => {
    renderPage(adminPermissions);

    await selectRoleFromDropdown('role-custom');

    expect(screen.getByTestId('role-save-btn')).toHaveTextContent('Save changes');
  });

  it('shows read-only state for view-only users on custom roles', async () => {
    renderPage(viewOnlyPermissions, [
      { _id: 'role-custom', name: 'Custom', isSystem: false, permissions: viewOnlyPermissions }
    ]);

    await selectRoleFromDropdown('role-custom');

    expect(await screen.findByText(/do not have permission to edit it/i)).toBeInTheDocument();
    expect(screen.queryByTestId('role-save-btn')).not.toBeInTheDocument();
  });

  it('nests access users and roles under Access in the permission tree', () => {
    renderPage(adminPermissions);

    const tree = screen.getByTestId('permission-tree');
    expect(within(tree).getByText('Access')).toBeInTheDocument();
    expect(within(tree).getByText('Users')).toBeInTheDocument();
    expect(within(tree).getByText('Roles & Permissions')).toBeInTheDocument();
    expect(within(tree).getByLabelText('View Users')).toBeInTheDocument();
    expect(within(tree).getByLabelText('View Roles')).toBeInTheDocument();
  });

  it('shows delete for custom roles when delete permission is granted', async () => {
    renderPage(adminPermissions);

    await selectRoleFromDropdown('role-custom');

    expect(screen.getByTestId('role-delete-btn')).toBeInTheDocument();
  });
});
