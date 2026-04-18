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

  it('renders the richer progress summary for statements', async () => {
    listStatementsMock.mockResolvedValueOnce({
      data: {
        data: {
          statements: [
            {
              id: 'statement-1',
              statementMonth: '2026-03',
              fileName: 'march-statement.pdf',
              source: 'upload',
              status: 'checks_queued',
              progress: {
                phase: 'checks_queued',
                totalChecks: 5,
                checksQueued: 2,
                checksProcessing: 1,
                checksReady: 2,
                checksFailed: 0,
                completedChecks: 2,
                remainingChecks: 3
              },
              issuesCount: 0,
              updatedAt: '2026-03-18T18:51:49.113Z',
              createdAt: '2026-03-18T18:51:49.113Z'
            }
          ]
        }
      }
    });

    render(
      <Provider store={createStore({ accountingView: false, bankStatementsView: true })}>
        <MemoryRouter>
          <StatementsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText(/Processing now/i)).toBeInTheDocument();
    expect(screen.getByText(/Open workspace/i)).toBeInTheDocument();
    expect(screen.getByText(/2 done • 3 left across 5 checks/i)).toBeInTheDocument();
    expect(screen.getByText(/^5 checks$/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2 done • 3 left/i).length).toBeGreaterThan(0);
  });

  it('does not auto-poll the statements list every 3 seconds', async () => {
    listStatementsMock.mockResolvedValue({
      data: {
        data: {
          statements: [
            {
              id: 'statement-1',
              statementMonth: '2026-03',
              fileName: 'march-statement.pdf',
              source: 'upload',
              status: 'extracting',
              progress: {
                phase: 'extracting',
                totalChecks: 0,
                checksQueued: 0,
                checksProcessing: 0,
                checksReady: 0,
                checksFailed: 0,
                completedChecks: 0,
                remainingChecks: 0
              },
              issuesCount: 0,
              updatedAt: '2026-03-18T18:51:49.113Z',
              createdAt: '2026-03-18T18:51:49.113Z'
            }
          ]
        }
      }
    });

    render(
      <Provider store={createStore({ accountingView: false, bankStatementsView: true })}>
        <MemoryRouter>
          <StatementsPage />
        </MemoryRouter>
      </Provider>
    );

    await screen.findByText(/march-statement.pdf/i);
    expect(listStatementsMock).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 3200));
    expect(listStatementsMock).toHaveBeenCalledTimes(1);
  }, 7000);
});
