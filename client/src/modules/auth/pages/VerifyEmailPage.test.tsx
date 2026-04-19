import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../../test/utils';
import { VerifyEmailPage } from './VerifyEmailPage';

const mockNavigate = vi.fn();
const mockRequest = vi.fn();
const mockConfirm = vi.fn();
const mockMe = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    requestEmailVerification: (...args: unknown[]) => mockRequest(...args),
    confirmEmailVerification: (...args: unknown[]) => mockConfirm(...args)
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

describe('VerifyEmailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequest.mockResolvedValue({
      data: { data: {} }
    });
    mockConfirm.mockResolvedValue({
      data: {
        data: {}
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('requests a verification email when no token is present', async () => {
    renderWithAppProviders(<VerifyEmailPage />, {
      initialEntries: ['/verify-email']
    });

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@retailsync.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send verification email' }));

    await waitFor(() => expect(mockRequest).toHaveBeenCalledWith({ email: 'user@retailsync.com' }));
    expect(mockNavigate).toHaveBeenCalledWith('/login?reason=verification-sent&email=user%40retailsync.com', { replace: true });
  });

  it('confirms a verification token from the link', async () => {
    renderWithAppProviders(<VerifyEmailPage />, {
      initialEntries: ['/verify-email?token=verify-token&email=user@retailsync.com']
    });

    await waitFor(() => expect(mockConfirm).toHaveBeenCalledWith({ token: 'verify-token' }));
    expect(mockNavigate).toHaveBeenCalledWith('/login?reason=verified&email=user%40retailsync.com', { replace: true });
  });
});
