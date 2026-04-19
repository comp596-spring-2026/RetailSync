import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../../test/utils';
import { ForgotPasswordPage } from './ForgotPasswordPage';

const mockNavigate = vi.fn();
const mockForgot = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    forgotPassword: (...args: unknown[]) => mockForgot(...args)
  }
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockForgot.mockResolvedValue({
      data: { data: {} }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('requests a password reset email', async () => {
    renderWithAppProviders(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@retailsync.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset email' }));

    await waitFor(() => expect(mockForgot).toHaveBeenCalledWith({ email: 'user@retailsync.com' }));
    expect(mockNavigate).toHaveBeenCalledWith('/login?reason=password-reset-sent&email=user%40retailsync.com', { replace: true });
  });
});
