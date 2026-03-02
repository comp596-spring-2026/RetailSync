import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import authReducer from '../../modules/auth/state';
import companyReducer from '../../modules/users/state';
import rbacReducer from '../../modules/rbac/state';
import uiReducer from '../../app/store/uiSlice';
import { setAccessToken } from '../../modules/auth/state';
import { ProtectedRoute } from './ProtectedRoute';

const createStore = (accessToken: string | null) => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });
  if (accessToken) {
    store.dispatch(setAccessToken(accessToken));
  }
  return store;
};

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no access token', () => {
    const store = createStore(null);
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

  it('renders outlet when access token is present', () => {
    const store = createStore('fake-token');
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
