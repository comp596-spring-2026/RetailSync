import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleKeys, PermissionsMap } from '@retailsync/shared';
import authReducer from '../../auth/state';
import companyReducer from '../state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import usersReducer from '../state/usersSlice';
import { UsersPage } from './UsersPage';

const dispatchMock = vi.fn((action: unknown) => {
  if (typeof action === 'function') {
    return action(dispatchMock, () => storeRef.current.getState(), undefined);
  }
  return action;
});

vi.mock('../../../app/store/hooks', () => ({
  useAppDispatch: () => dispatchMock,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(storeRef.current.getState())
}));

const storeRef: { current: ReturnType<typeof configureStore> } = {
  current: configureStore({ reducer: { auth: authReducer } })
};

const buildPermissions = (overrides: Partial<Record<string, Partial<PermissionsMap[keyof PermissionsMap]>>>) => {
  const permissions = {} as PermissionsMap;
  for (const key of moduleKeys) {
    permissions[key] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: [],
      ...(overrides[key] ?? {})
    };
  }
  return permissions;
};

const adminRolePermissions = buildPermissions({
  users: { view: true, edit: true, delete: true, actions: ['invite', 'assignRole'] }
});

const renderPage = (
  permissions: PermissionsMap,
  users: Array<Record<string, unknown>> = [],
  options?: { invites?: Array<Record<string, unknown>> }
) => {
  storeRef.current = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      users: usersReducer,
      ui: uiReducer
    } as never,
    preloadedState: {
      auth: {
        accessToken: 'token',
        user: {
          _id: 'user-self',
          firstName: 'Self',
          lastName: 'User',
          email: 'self@test.com',
          companyId: 'c1',
          roleId: 'r-member'
        },
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
        modules: [],
        roles: [
          { _id: 'r-admin', name: 'Admin', isSystem: true, permissions: adminRolePermissions },
          { _id: 'r-member', name: 'Member', isSystem: false, permissions: adminRolePermissions }
        ],
        selectedRole: null,
        loading: false,
        mutating: false,
        error: null
      },
      users: {
        users: users as never[],
        invites: options?.invites ?? [],
        loading: false,
        mutating: false,
        error: null
      },
      ui: { open: false, message: '', severity: 'info' }
    } as never
  });

  return render(
    <Provider store={storeRef.current}>
      <UsersPage showHeader={false} />
    </Provider>
  );
};

describe('UsersPage member management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('hides + Add without invite permission', () => {
    renderPage(buildPermissions({ users: { view: true, actions: [] } }));
    expect(screen.queryByTestId('invite-member-add')).not.toBeInTheDocument();
  });

  it('shows + Add with invite permission', () => {
    renderPage(buildPermissions({ users: { view: true, actions: ['invite'] } }));
    expect(screen.getByTestId('invite-member-add')).toBeInTheDocument();
  });

  it('opens invite modal from + Add', () => {
    renderPage(buildPermissions({ users: { view: true, actions: ['invite'] } }));
    fireEvent.click(screen.getByTestId('invite-member-add'));
    expect(screen.getByText('Invite Member')).toBeInTheDocument();
  });

  it('shows protected label for system admin member', () => {
    renderPage(
      buildPermissions({ users: { view: true, edit: true, delete: true, actions: ['assignRole'] } }),
      [
        {
          _id: 'user-admin',
          firstName: 'Hop',
          lastName: 'In',
          email: 'hopin@test.com',
          isActive: true,
          createdAt: '2026-05-01T00:00:00.000Z',
          roleId: { _id: 'r-admin', name: 'Admin', isSystem: true }
        }
      ]
    );

    expect(screen.getByText('Protected')).toBeInTheDocument();
    expect(screen.queryByLabelText(/edit member/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/remove member/i)).not.toBeInTheDocument();
  });

  it('shows role chip only without assignRole permission', () => {
    renderPage(
      buildPermissions({ users: { view: true } }),
      [
        {
          _id: 'user-2',
          firstName: 'Other',
          lastName: 'User',
          email: 'other@test.com',
          isActive: true,
          roleId: { _id: 'r-member', name: 'Member', isSystem: false }
        }
      ]
    );

    expect(screen.getByText('Member')).toBeInTheDocument();
    expect(screen.queryByLabelText(/change role/i)).not.toBeInTheDocument();
  });

  it('shows delete confirmation for removable member', () => {
    renderPage(
      buildPermissions({ users: { view: true, delete: true } }),
      [
        {
          _id: 'user-2',
          firstName: 'Other',
          lastName: 'User',
          email: 'other@test.com',
          isActive: true,
          roleId: { _id: 'r-member', name: 'Member', isSystem: false }
        }
      ]
    );

    fireEvent.click(screen.getByLabelText(/remove member/i));
    expect(screen.getByRole('dialog', { name: /remove member/i })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: /remove member/i })).getByText(/lose access to this workspace/i)
    ).toBeInTheDocument();
  });
});
