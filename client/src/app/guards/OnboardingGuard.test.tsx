import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import authReducer from '../../slices/auth/authSlice';
import companyReducer from '../../slices/company/companySlice';
import rbacReducer from '../../slices/rbac/rbacSlice';
import uiReducer from '../../slices/ui/uiSlice';
import { setAccessToken, setAuthContext } from '../../slices/auth/authSlice';
import { OnboardingGuard } from './OnboardingGuard';

const createStore = (overrides: { accessToken?: string | null; companyId?: string | null } = {}) => {
  const { accessToken = 'token', companyId = null } = overrides;
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
  if (companyId !== undefined && companyId !== null) {
    store.dispatch(
      setAuthContext({
        user: { _id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', companyId, roleId: null },
        role: null,
        permissions: null
      })
    );
  } else if (accessToken && companyId === null) {
    store.dispatch(
      setAuthContext({
        user: { _id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', companyId: null, roleId: null },
        role: null,
        permissions: null
      })
    );
  }
  return store;
};

describe('OnboardingGuard', () => {
  it('redirects to /login when there is no token', () => {
    const store = createStore({ accessToken: null });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingGuard />}>
              <Route index element={<div>Onboarding content</div>} />
            </Route>
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding content')).not.toBeInTheDocument();
  });

  it('redirects to /dashboard when user has companyId', () => {
    const store = createStore({ companyId: 'company-1' });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingGuard />}>
              <Route index element={<div>Onboarding content</div>} />
            </Route>
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Onboarding content')).not.toBeInTheDocument();
  });

  it('renders outlet when user has token but no companyId', () => {
    const store = createStore({ accessToken: 'token', companyId: null });
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingGuard />}>
              <Route index element={<div>Onboarding content</div>} />
            </Route>
            <Route path="/login" element={<div>Login page</div>} />
            <Route path="/dashboard" element={<div>Dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Onboarding content')).toBeInTheDocument();
  });
});
