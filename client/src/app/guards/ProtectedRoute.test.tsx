import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import authReducer from '../../modules/auth/state';
import companyReducer from '../../modules/users/state';
import rbacReducer from '../../modules/rbac/state';
import uiReducer from '../../app/store/uiSlice';
import { markAuthRehydrated, setAccessToken, setAuthContext } from '../../modules/auth/state';
import { ProtectedRoute } from './ProtectedRoute';

const createStore = ({
  accessToken,
  rehydrated = true,
  contextReady = true
}: {
  accessToken: string | null;
  rehydrated?: boolean;
  contextReady?: boolean;
}) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });
  if (rehydrated) {
    store.dispatch(markAuthRehydrated());
  }
  if (accessToken) {
    store.dispatch(setAccessToken(accessToken));
    if (contextReady) {
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
          permissions: null
        })
      );
    }
  }
  return store;
};

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no access token', () => {
    const store = createStore({ accessToken: null });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<ProtectedRoute />}>
              <Route index element={<div>Protected content</div>} />
            </Route>
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('shows a restore loader while persisted auth is being re-synced', () => {
    const store = createStore({ accessToken: 'fake-token', contextReady: false });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<ProtectedRoute />}>
              <Route index element={<div>Protected content</div>} />
            </Route>
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Restoring access...')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders outlet when access token is present and context is ready', () => {
    const store = createStore({ accessToken: 'fake-token' });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<ProtectedRoute />}>
              <Route index element={<div>Protected content</div>} />
            </Route>
            <Route path="/login" element={<div>Login</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
