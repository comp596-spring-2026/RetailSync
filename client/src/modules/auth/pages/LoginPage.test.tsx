import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { LoginPage } from './LoginPage';

const mockNavigate = vi.fn();
const mockLogin = vi.fn();
const mockMe = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    login: (...args: unknown[]) => mockLogin(...args)
  }
}));

vi.mock('../../../app/auth/fetchMeAndSync', () => ({
  fetchMeAndSync: (...args: unknown[]) => mockMe(...args)
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLogin.mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token'
        }
      }
    });
    mockMe.mockResolvedValue({
      company: { _id: 'company-1' }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the email and password login form', () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByAltText('RetailSync')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
  });

  it('signs in with email and password', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </Provider>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@retailsync.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: 'user@retailsync.com', password: 'password123' }));
    await waitFor(() => expect(mockMe).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
