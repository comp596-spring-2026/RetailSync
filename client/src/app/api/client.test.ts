import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  axiosPostMock,
  apiInstanceMock,
  dispatchMock,
  getStateMock,
  setAccessTokenMock,
  logoutMock,
  clearCompanyMock,
  syncAuthContextThunkMock
} = vi.hoisted(() => {
  const apiInstance = Object.assign(vi.fn(), {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() }
    }
  });

  return {
    axiosPostMock: vi.fn(),
    apiInstanceMock: apiInstance,
    dispatchMock: vi.fn(),
    getStateMock: vi.fn(),
    setAccessTokenMock: vi.fn((payload: string | null) => ({
      type: 'auth/setAccessToken',
      payload
    })),
    logoutMock: vi.fn(() => ({ type: 'auth/logout' })),
    clearCompanyMock: vi.fn(() => ({ type: 'company/clear' })),
    syncAuthContextThunkMock: vi.fn((payload?: unknown) => ({
      type: 'auth/syncAuthContext',
      payload
    }))
  };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => apiInstanceMock),
    post: axiosPostMock
  }
}));

vi.mock('../store', () => ({
  store: {
    dispatch: dispatchMock,
    getState: getStateMock
  }
}));

vi.mock('../../modules/users/state', () => ({
  clearCompany: clearCompanyMock
}));

vi.mock('../../modules/auth/state', () => ({
  logout: logoutMock,
  setAccessToken: setAccessTokenMock,
  syncAuthContextThunk: syncAuthContextThunkMock
}));

describe('api client refresh interceptor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStateMock.mockReturnValue({
      auth: {
        accessToken: 'stale-access-token',
        permissions: {
          dashboard: { view: true, create: false, edit: false, delete: false, actions: [] }
        }
      }
    });
  });

  it('refreshes auth context after rotating the access token', async () => {
    let responseRejected: ((error: any) => Promise<unknown>) | undefined;

    apiInstanceMock.interceptors.response.use.mockImplementation(
      (_onFulfilled: unknown, onRejected: (error: any) => Promise<unknown>) => {
        responseRejected = onRejected;
      }
    );
    apiInstanceMock.mockResolvedValue({ data: { ok: true } });
    axiosPostMock.mockResolvedValue({
      data: {
        data: {
          accessToken: 'fresh-access-token'
        }
      }
    });

    await import('./client');

    await responseRejected?.({
      response: { status: 401 },
      config: {
        headers: {}
      }
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'auth/setAccessToken',
      payload: 'fresh-access-token'
    });
    expect(dispatchMock).toHaveBeenCalledWith({
      type: 'auth/syncAuthContext',
      payload: { reason: 'token_refresh' }
    });
  });
});
