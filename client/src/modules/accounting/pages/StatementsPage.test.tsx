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

const { listStatementsMock, listStatementMonthsMock, getQuickbooksHubChartOfAccountsMock } = vi.hoisted(() => ({
  listStatementsMock: vi.fn(),
  listStatementMonthsMock: vi.fn(),
  getQuickbooksHubChartOfAccountsMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    listStatements: (...args: unknown[]) => listStatementsMock(...args),
    listStatementMonths: (...args: unknown[]) => listStatementMonthsMock(...args),
    getQuickbooksHubChartOfAccounts: (...args: unknown[]) => getQuickbooksHubChartOfAccountsMock(...args)
  }
}));

let quickBooksConnected = true;

vi.mock('../hooks/useQuickBooksWorkspace', () => ({
  useQuickBooksWorkspace: () => ({
    isConnected: quickBooksConnected
  })
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
  bankStatementsView = false,
  quickbooksView = true
}: {
  accountingView?: boolean;
  bankStatementsView?: boolean;
  quickbooksView?: boolean;
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
  if (permissions.quickbooks) {
    permissions.quickbooks.view = quickbooksView;
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
    quickBooksConnected = true;
    window.localStorage.clear();
    listStatementsMock.mockResolvedValue({
      data: {
        data: {
          statements: []
        }
      }
    });
    listStatementMonthsMock.mockResolvedValue({
      data: {
        data: {
          months: []
        }
      }
    });
    getQuickbooksHubChartOfAccountsMock.mockResolvedValue({
      data: {
        data: {
          items: [
            {
              id: 'acct-1',
              qbId: '35',
              name: 'Checking',
              detailType: 'Checking',
              type: 'Bank',
              status: 'active'
            }
          ]
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

  it('shows Go to Settings when QuickBooks is not connected', () => {
    quickBooksConnected = false;
    window.localStorage.setItem('accounting.statement.defaultBankAccountId', '35');

    render(
      <Provider store={createStore({ bankStatementsView: true })}>
        <MemoryRouter>
          <StatementsPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getAllByRole('button', { name: /Go to Settings/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Connect QuickBooks in Settings/i).length).toBeGreaterThan(0);
    expect(screen.queryByText('No statements yet')).not.toBeInTheDocument();
    expect(listStatementsMock).not.toHaveBeenCalled();
  });

  it('renders the richer progress summary for statements', async () => {
    window.localStorage.setItem('accounting.statement.defaultBankAccountId', '35');
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

    expect(await screen.findByText(/Running/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/Mar 2026 · Checks/i)).toBeInTheDocument();
    expect(screen.getByText(/2 done • 3 left/i)).toBeInTheDocument();
  });

  it('auto-polls the statements list while a statement is in-flight', async () => {
    window.localStorage.setItem('accounting.statement.defaultBankAccountId', '35');
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

    await screen.findByText(/Mar 2026 · Extracting/i);
    expect(listStatementsMock).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 4500));
    expect(listStatementsMock.mock.calls.length).toBeGreaterThan(1);
  }, 10000);
});
