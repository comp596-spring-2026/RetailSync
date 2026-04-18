import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { AcceptInvitePage } from './AcceptInvitePage';

const mockNavigate = vi.fn();
const mockGetInvite = vi.fn();
const mockAcceptInvite = vi.fn();
const mockMe = vi.fn();

vi.mock('../api', () => ({
  authApi: {
    getInvite: (...args: unknown[]) => mockGetInvite(...args),
    acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args)
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

describe('AcceptInvitePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInvite.mockResolvedValue({
      data: {
        data: {
          email: 'invitee@example.com',
          inviteCode: 'INVITE123',
          company: { _id: 'c1', name: 'Invite Retail', code: 'RS-ABC123' },
          role: { _id: 'r1', name: 'Viewer' },
          expiresAt: '2026-04-30T00:00:00.000Z'
        }
      }
    });
    mockAcceptInvite.mockResolvedValue({
      data: {
        data: {
          accessToken: 'invite-token'
        }
      }
    });
    mockMe.mockResolvedValue({
      company: { _id: 'c1' }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('loads invite context and activates the invite with a password', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/accept-invite?email=invitee@example.com&inviteCode=INVITE123']}>
          <AcceptInvitePage />
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText('Invite Retail')).toBeInTheDocument();
    expect(mockGetInvite).toHaveBeenCalledWith({ email: 'invitee@example.com', inviteCode: 'INVITE123' });

    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Invited' } });
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'User' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Invitee123!' } });
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Invitee123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set password and continue' }));

    await waitFor(() =>
      expect(mockAcceptInvite).toHaveBeenCalledWith({
        firstName: 'Invited',
        lastName: 'User',
        email: 'invitee@example.com',
        inviteCode: 'INVITE123',
        password: 'Invitee123!'
      })
    );
    await waitFor(() => expect(mockMe).toHaveBeenCalled());
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });
});
