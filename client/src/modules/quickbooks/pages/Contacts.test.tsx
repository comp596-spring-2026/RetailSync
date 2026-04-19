import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import ContactsPage from './Contacts';

const {
  getQuickbooksHubEntitiesMock,
  getQuickbooksContactMock,
  postQuickbooksContactMock,
  patchQuickbooksContactMock,
  deleteQuickbooksContactMock,
  useQuickBooksWorkspaceMock
} = vi.hoisted(() => ({
  getQuickbooksHubEntitiesMock: vi.fn(),
  getQuickbooksContactMock: vi.fn(),
  postQuickbooksContactMock: vi.fn(),
  patchQuickbooksContactMock: vi.fn(),
  deleteQuickbooksContactMock: vi.fn(),
  useQuickBooksWorkspaceMock: vi.fn()
}));

vi.mock('../../accounting/api', () => ({
  accountingApi: {
    getQuickbooksHubEntities: (...args: unknown[]) => getQuickbooksHubEntitiesMock(...args),
    getQuickbooksContact: (...args: unknown[]) => getQuickbooksContactMock(...args),
    postQuickbooksContact: (...args: unknown[]) => postQuickbooksContactMock(...args),
    patchQuickbooksContact: (...args: unknown[]) => patchQuickbooksContactMock(...args),
    deleteQuickbooksContact: (...args: unknown[]) => deleteQuickbooksContactMock(...args)
  }
}));

vi.mock('../hooks/useQuickBooksWorkspace', () => ({
  useQuickBooksWorkspace: (...args: unknown[]) => useQuickBooksWorkspaceMock(...args)
}));

vi.mock('../components', () => ({
  QuickBooksTabs: () => null,
  RequireQuickBooksConnection: ({ children }: { children: ReactNode }) => <>{children}</>
}));

const createPermissions = (): PermissionsMap => {
  const permissions = {} as PermissionsMap;
  for (const moduleKey of moduleKeys) {
    permissions[moduleKey] = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    };
  }

  permissions.quickbooks = {
    view: true,
    create: false,
    edit: false,
    delete: false,
    actions: ['connect', 'sync', 'post']
  };

  return permissions;
};

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
        _id: 'u1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        companyId: 'c1',
        roleId: 'r1'
      },
      role: null,
      permissions: createPermissions()
    })
  );

  return store;
};

const workspaceState = {
  loading: false,
  isConnected: true,
  error: null,
  warning: null,
  load: vi.fn(),
  settings: { connected: true },
  oauthStatus: { ok: true, reason: null }
};

const customerListPayload = {
  data: {
    data: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: 'cust-1',
          qbId: 'cust-1',
          entityType: 'customer',
          displayName: 'Acme Stores',
          companyName: 'Acme Stores',
          givenName: null,
          familyName: null,
          email: 'ap@acme.test',
          phone: '555-1111',
          status: 'active',
          balance: 25
        }
      ]
    }
  }
};

const vendorListPayload = {
  data: {
    data: {
      page: 1,
      pageSize: 25,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: 'ven-1',
          qbId: 'ven-1',
          entityType: 'vendor',
          displayName: 'Northwind Supply',
          companyName: 'Northwind Supply',
          givenName: null,
          familyName: null,
          email: 'payables@northwind.test',
          phone: '555-2222',
          status: 'active',
          balance: 0
        }
      ]
    }
  }
};

describe('QuickBooks contacts page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useQuickBooksWorkspaceMock.mockReturnValue(workspaceState);
    getQuickbooksHubEntitiesMock.mockImplementation((entityType: string) =>
      Promise.resolve(entityType === 'vendor' ? vendorListPayload : customerListPayload)
    );
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a customer and closes the dialog after save', async () => {
    postQuickbooksContactMock.mockResolvedValue({
      data: { data: { qbId: 'cust-2' } }
    });
    getQuickbooksHubEntitiesMock
      .mockResolvedValueOnce(customerListPayload)
      .mockResolvedValueOnce({
        data: {
          data: {
            ...customerListPayload.data.data,
            total: 2,
            items: [
              ...customerListPayload.data.data.items,
              {
                id: 'cust-2',
                qbId: 'cust-2',
                entityType: 'customer',
                displayName: 'Retail Counter',
                companyName: 'Retail Counter',
                givenName: null,
                familyName: null,
                email: 'owner@retail.test',
                phone: '555-4444',
                status: 'active',
                balance: 0
              }
            ]
          }
        }
      });

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ContactsPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText('Acme Stores')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'New Customer' }));

    const dialog = await screen.findByRole('dialog');
    const dialogScope = within(dialog);

    fireEvent.change(dialogScope.getByRole('textbox', { name: 'Display Name' }), {
      target: { value: 'Retail Counter' }
    });
    fireEvent.change(dialogScope.getByRole('textbox', { name: 'Company Name' }), {
      target: { value: 'Retail Counter' }
    });
    fireEvent.change(dialogScope.getByRole('textbox', { name: 'Email' }), {
      target: { value: 'owner@retail.test' }
    });
    fireEvent.change(dialogScope.getByRole('textbox', { name: 'Phone' }), {
      target: { value: '555-4444' }
    });

    fireEvent.click(dialogScope.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(postQuickbooksContactMock).toHaveBeenCalledWith('customer', {
        displayName: 'Retail Counter',
        companyName: 'Retail Counter',
        email: 'owner@retail.test',
        phone: '555-4444',
        givenName: undefined,
        familyName: undefined
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    expect(await screen.findByText('Retail Counter')).toBeInTheDocument();
  });

  it('loads vendor mode and deactivates a vendor', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteQuickbooksContactMock.mockResolvedValue({
      data: { data: { qbId: 'ven-1', deleted: true } }
    });
    getQuickbooksHubEntitiesMock.mockResolvedValue(vendorListPayload);

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ContactsPage />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Customers' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Vendors' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'New Vendor' })).toBeInTheDocument();
      expect(getQuickbooksHubEntitiesMock).toHaveBeenLastCalledWith(
        'vendor',
        expect.objectContaining({
          page: 1,
          pageSize: 25,
          search: undefined,
          sort: undefined,
          status: undefined
        })
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    await waitFor(() => {
      expect(deleteQuickbooksContactMock).toHaveBeenCalledWith('vendor', 'ven-1');
    });
  });
});
