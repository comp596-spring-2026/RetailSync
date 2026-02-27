import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import authReducer from '../../slices/auth/authSlice';
import companyReducer from '../../slices/company/companySlice';
import rbacReducer from '../../slices/rbac/rbacSlice';
import uiReducer from '../../slices/ui/uiSlice';
import { setAccessToken } from '../../slices/auth/authSlice';
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
  it('redirects to /401 when there is no access token', () => {
    const store = createStore(null);
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<ProtectedRoute />}>
              <Route index element={<div>Protected content</div>} />
            </Route>
            <Route path="/401" element={<div>Unauthorized</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Unauthorized')).toBeInTheDocument();
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
            <Route path="/401" element={<div>Unauthorized</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
