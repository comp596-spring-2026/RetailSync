import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { StatementsPage } from './StatementsPage';

const { listStatementsMock } = vi.hoisted(() => ({
  listStatementsMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    listStatements: (...args: unknown[]) => listStatementsMock(...args)
  }
}));

vi.mock('../components', async () => {
  const actual = await vi.importActual<typeof import('../components')>('../components');
  return {
    ...actual,
    UploadStatementDialog: () => null
  };
});

const createPermissions = ({
  accountingView = false,
  bankStatementsView = false
}: {
  accountingView?: boolean;
  bankStatementsView?: boolean;
} = {}) => {
  const permissions = {} as PermissionsMap;
  for (const moduleKey of moduleKeys) {
    permissions[moduleKey] = {
      view: false,
      create: false,
      edit: false,
      delete: false,
      actions: []
    };
  }

  if (permissions.accounting) {
    permissions.accounting.view = accountingView;
  }
  if (permissions.bankStatements) {
    permissions.bankStatements.view = bankStatementsView;
  }

  return permissions;
};

const createStore = (options?: { accountingView?: boolean; bankStatementsView?: boolean }) => {
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
        _id: 'u1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        companyId: 'c1',
        roleId: 'r1'
      },
      role: null,
      permissions: createPermissions(options)
    })
  );

  return store;
};

describe('StatementsPage', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    listStatementsMock.mockResolvedValue({
      data: {
        data: {
          statements: []
        }
      }
    });
  });

  it('requires bankStatements:view instead of allowing accounting:view alone', () => {
    render(
      <Provider store={createStore({ accountingView: true, bankStatementsView: false })}>
        <MemoryRouter>
          <StatementsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('No Access')).toBeInTheDocument();
    expect(listStatementsMock).not.toHaveBeenCalled();
  });
});
