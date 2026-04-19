import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithAppProviders } from '../../../test/utils';
import { CreateCompanyPage } from './CreateCompanyPage';

const mockNavigate = vi.fn();
const mockCreate = vi.fn();
const mockMe = vi.fn();
const mockGetQuickBooksOnboardingStatus = vi.fn();
const mockStartQuickBooksOnboarding = vi.fn();

vi.mock('../../users/api', () => ({
  companyApi: {
    create: (...args: unknown[]) => mockCreate(...args),
    getQuickBooksOnboardingStatus: (...args: unknown[]) => mockGetQuickBooksOnboardingStatus(...args),
    startQuickBooksOnboarding: (...args: unknown[]) => mockStartQuickBooksOnboarding(...args)
  }
}));

vi.mock('../../../app/api', () => ({
  authApi: {
    me: (...args: unknown[]) => mockMe(...args)
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

describe('CreateCompanyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
    mockGetQuickBooksOnboardingStatus.mockResolvedValue({
      data: {
        data: {
          quickbooks: null
        }
      }
    });
    mockStartQuickBooksOnboarding.mockResolvedValue({
      data: {
        data: {
          url: 'https://appcenter.intuit.com/connect/oauth2',
          environment: 'sandbox'
        }
      }
    });
    mockMe.mockResolvedValue({
      data: {
        data: {
          user: { _id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', companyId: 'c1', roleId: 'r1' },
          role: null,
          permissions: null,
          company: { _id: 'c1', name: 'RetailSync' }
        }
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('submits company creation with inferred timezone and currency values', async () => {
    renderWithAppProviders(<CreateCompanyPage />);

    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'RetailSync HQ' } });
    fireEvent.change(screen.getByLabelText('Business Type'), { target: { value: 'Retail' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '1 Main Street' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '5551234567' } });
    fireEvent.change(screen.getByLabelText('Company Email'), { target: { value: 'owner@retailsync.com' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create company' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: expect.any(String),
        currency: expect.any(String)
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('starts QuickBooks onboarding directly from the connect button', async () => {
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '' }
    });

    renderWithAppProviders(<CreateCompanyPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect company' }));

    await waitFor(() =>
      expect(mockStartQuickBooksOnboarding).toHaveBeenCalledWith('/onboarding/create-company')
    );
    expect(window.location.href).toBe('https://appcenter.intuit.com/connect/oauth2');
    expect(mockCreate).not.toHaveBeenCalled();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation
    });
  });
});
