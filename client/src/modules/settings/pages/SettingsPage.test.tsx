import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { memberProductPermissions, moduleKeys, productPermissionsToLegacy, PermissionsMap } from '@retailsync/shared';
import authReducer from '../../auth/state';
import companyReducer from '../../users/state/companySlice';
import settingsReducer from '../state/settingsSlice';
import { SettingsPage } from './SettingsPage';

vi.mock('../hooks/useSettingsPageViewModel', () => ({
  useSettingsPageViewModel: () => ({
    settings: {
      googleSheets: { mode: 'oauth', serviceAccountEmail: '', connected: false, connectedEmail: null, sources: [] },
      quickbooks: null
    },
    loading: false,
    error: null,
    oauthStatus: null,
    isBusy: false,
    syncOverview: null,
    syncProgress: null,
    quickbooksOauthStatus: null,
    onModeChange: vi.fn(),
    onSyncNow: vi.fn(),
    onSaveSyncSchedule: vi.fn(),
    onDeleteSheetSource: vi.fn(),
    onSaveSharedConfig: vi.fn(),
    onVerifySharedConfig: vi.fn(),
    onCheckOAuthStatus: vi.fn(),
    onToggleUpdateDbWithSheet: vi.fn(),
    onConnectQuickBooks: vi.fn(),
    onDisconnectQuickBooks: vi.fn(),
    onRefreshQuickbooksReferences: vi.fn(),
    onPostApprovedQuickbooks: vi.fn(),
    onRefreshQuickbooksStatus: vi.fn(),
    refreshSettings: vi.fn()
  })
}));

const memberPermissions = productPermissionsToLegacy(memberProductPermissions());

describe('SettingsPage access UX', () => {
  it('shows restricted notice when settings.view is missing', () => {
    const permissions = { ...memberPermissions };
    permissions.settings = { view: false, create: false, edit: false, delete: false, actions: [] };

    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer,
        settings: settingsReducer
      } as never,
      preloadedState: {
        auth: {
          accessToken: 'token',
          user: { _id: 'u1', firstName: 'Pat', lastName: 'Lee', email: 'pat@test.com', companyId: 'c1', roleId: 'r1' },
          role: { _id: 'r1', name: 'Member', isSystem: true },
          permissions,
          status: 'authenticated',
          error: null,
          loggingOut: false,
          isRehydrated: true,
          isContextReady: true,
          isSyncingContext: false
        },
        company: { company: { name: 'Retail Co' } },
        settings: {
          data: null,
          loading: false,
          error: null,
          oauthStatus: null,
          mutating: false
        }
      } as never
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <SettingsPage showHeader={false} />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText(/do not have permission to view this module/i)).toBeInTheDocument();
  });

  it('renders integrations when settings.view is granted', () => {
    const permissions = { ...memberPermissions };

    const store = configureStore({
      reducer: {
        auth: authReducer,
        company: companyReducer,
        settings: settingsReducer
      } as never,
      preloadedState: {
        auth: {
          accessToken: 'token',
          user: { _id: 'u1', firstName: 'Pat', lastName: 'Lee', email: 'pat@test.com', companyId: 'c1', roleId: 'r1' },
          role: { _id: 'r1', name: 'Member', isSystem: true },
          permissions,
          status: 'authenticated',
          error: null,
          loggingOut: false,
          isRehydrated: true,
          isContextReady: true,
          isSyncingContext: false
        },
        company: { company: { name: 'Retail Co' } },
        settings: {
          data: null,
          loading: false,
          error: null,
          oauthStatus: null,
          mutating: false
        }
      } as never
    });

    render(
      <Provider store={store}>
        <MemoryRouter>
          <SettingsPage showHeader={false} />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText(/Integrations/i)).toBeInTheDocument();
  });
});
