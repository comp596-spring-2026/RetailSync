import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import authReducer from '../../slices/auth/authSlice';
import companyReducer from '../../slices/company/companySlice';
import rbacReducer from '../../slices/rbac/rbacSlice';
import uiReducer from '../../slices/ui/uiSlice';
import { LoginPage } from './LoginPage';

const store = configureStore({
  reducer: {
    auth: authReducer,
    company: companyReducer,
    rbac: rbacReducer,
    ui: uiReducer
  }
});

describe('LoginPage', () => {
  it('renders login title and Google sign-in button', () => {
    render(
      <Provider store={store}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </Provider>
    );
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeInTheDocument();
  });
});
