import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { ResetPasswordPage } from './ResetPasswordPage';

const mockNavigate = vi.fn();
const mockReset = vi.fn();
const mockMe = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    resetPassword: (...args: unknown[]) => mockReset(...args)
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

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReset.mockResolvedValue({
      data: {
        data: {}
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('resets the password from a reset token', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/reset-password?token=reset-token&email=user@retailsync.com']}>
          <ResetPasswordPage />
        </MemoryRouter>
      </Provider>
    );

    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(mockReset).toHaveBeenCalledWith({ token: 'reset-token', password: 'password123' }));
    expect(mockNavigate).toHaveBeenCalledWith('/login?reason=password-reset-complete&email=user%40retailsync.com', { replace: true });
  });
});
