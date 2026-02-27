import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../../slices/auth/authSlice';
import companyReducer from '../../slices/company/companySlice';
import rbacReducer from '../../slices/rbac/rbacSlice';
import uiReducer from '../../slices/ui/uiSlice';
import { JoinCompanyPage } from './JoinCompanyPage';

const mockNavigate = vi.fn();
const mockJoin = vi.fn();
const mockMe = vi.fn();

vi.mock('../../api', () => ({
  companyApi: {
    join: (...args: unknown[]) => mockJoin(...args)
  },
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

describe('JoinCompanyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJoin.mockResolvedValue({});
    mockMe.mockResolvedValue({
      data: {
        data: {
          user: { _id: 'u1', firstName: 'A', lastName: 'B', email: 'a@b.com', companyId: 'c1', roleId: 'r1' },
          role: null,
          permissions: null,
          company: { _id: 'c1', name: 'Acme' }
        }
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('submits join form and navigates to dashboard on success', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <JoinCompanyPage />
        </MemoryRouter>
      </Provider>
    );

    fireEvent.change(screen.getByLabelText('Company Code'), { target: { value: 'RS-ABC123' } });
    fireEvent.change(screen.getByLabelText('Invite Code'), { target: { value: 'invite123' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join Company' }));

    await waitFor(() => expect(mockJoin).toHaveBeenCalledWith({ companyCode: 'RS-ABC123', inviteCode: 'invite123', email: 'user@example.com' }));
    expect(mockMe).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
