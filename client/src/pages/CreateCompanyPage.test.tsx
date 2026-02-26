import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../features/auth/authSlice';
import companyReducer from '../features/company/companySlice';
import rbacReducer from '../features/rbac/rbacSlice';
import uiReducer from '../features/ui/uiSlice';
import { CreateCompanyPage } from './CreateCompanyPage';

const mockNavigate = vi.fn();
const mockCreate = vi.fn();
const mockMe = vi.fn();

vi.mock('../api/companyApi', () => ({
  companyApi: {
    create: (...args: unknown[]) => mockCreate(...args)
  }
}));

vi.mock('../api/authApi', () => ({
  authApi: {
    me: (...args: unknown[]) => mockMe(...args)
  }
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

describe('CreateCompanyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({});
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

  it('submits company creation with timezone/currency dropdown values', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <CreateCompanyPage />
        </MemoryRouter>
      </Provider>
    );

    fireEvent.change(screen.getByLabelText('Company Name'), { target: { value: 'RetailSync HQ' } });
    fireEvent.change(screen.getByLabelText('Business Type'), { target: { value: 'Retail' } });
    fireEvent.change(screen.getByLabelText('Address'), { target: { value: '1 Main Street' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '5551234567' } });
    fireEvent.change(screen.getByLabelText('Company Email'), { target: { value: 'owner@retailsync.com' } });

    const currencyInput = screen.getByLabelText('Currency');
    fireEvent.change(currencyInput, { target: { value: 'Dollar' } });
    expect(await screen.findByText('USD ($) - US Dollar')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Create Company' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        timezone: expect.any(String),
        currency: expect.any(String)
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
