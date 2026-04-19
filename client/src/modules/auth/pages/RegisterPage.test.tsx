import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../../test/utils';
import { RegisterPage } from './RegisterPage';

const mockNavigate = vi.fn();
const mockRegister = vi.fn();
const mockMe = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    register: (...args: unknown[]) => mockRegister(...args)
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

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockRegister.mockResolvedValue({
      data: {
        data: {
          accessToken: 'access-token'
        }
      }
    });
    mockMe.mockResolvedValue({
      company: null
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('creates the user account first and routes into onboarding', async () => {
    renderWithAppProviders(<RegisterPage />);

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Lovelace' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@retailsync.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() =>
      expect(mockRegister).toHaveBeenCalledWith({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@retailsync.com',
        password: 'password123'
      })
    );

    await waitFor(() => expect(mockMe).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true });
  });
});
