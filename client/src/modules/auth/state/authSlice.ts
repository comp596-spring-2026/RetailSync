import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PermissionsMap } from '@retailsync/shared';
import { authApi } from '../api';
import { clearCompany } from '../../users/state';
import type { AppDispatch, RootState } from '../../../app/store';
import { fetchMeAndSync, type MeData } from '../../../app/auth/fetchMeAndSync';

export type AuthUser = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  companyId: string | null;
  roleId: string | null;
};

export type AuthRole = {
  _id: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionsMap;
};

type AuthState = {
  accessToken: string | null;
  user: AuthUser | null;
  role: AuthRole | null;
  permissions: PermissionsMap | null;
  status: 'idle' | 'loading' | 'authenticated';
  error: string | null;
  loggingOut: boolean;
  isRehydrated: boolean;
  isContextReady: boolean;
  isSyncingContext: boolean;
};

const initialState: AuthState = {
  accessToken: null,
  user: null,
  role: null,
  permissions: null,
  status: 'idle',
  error: null,
  loggingOut: false,
  isRehydrated: false,
  isContextReady: false,
  isSyncingContext: false
};

export const syncAuthContextThunk = createAsyncThunk<
  MeData,
  { reason?: 'persist_restore' | 'token_refresh' | 'manual' } | undefined,
  { dispatch: AppDispatch; state: RootState }
>(
  'auth/syncAuthContext',
  async (_payload, { dispatch }) => fetchMeAndSync(dispatch),
  {
    condition: (_payload, { getState }) => {
      const auth = getState().auth;
      return Boolean(auth.accessToken) && !auth.isSyncingContext && !auth.loggingOut;
    }
  }
);

export const logoutThunk = createAsyncThunk<void>(
  'auth/logout',
  async (_, { dispatch }) => {
    try {
      await authApi.logout();
    } finally {
      dispatch(logout());
      dispatch(clearCompany());
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    markAuthRehydrated(state) {
      state.isRehydrated = true;
      if (!state.accessToken) {
        state.isContextReady = true;
      }
    },
    setAccessToken(state, action: PayloadAction<string | null>) {
      state.accessToken = action.payload;
      if (action.payload) {
        state.status = state.user ? 'authenticated' : 'loading';
        state.isContextReady = false;
      } else {
        state.status = 'idle';
        state.isContextReady = state.isRehydrated;
      }
    },
    setAuthContext(
      state,
      action: PayloadAction<{ user: AuthUser; role: AuthRole | null; permissions: PermissionsMap | null }>
    ) {
      state.user = action.payload.user;
      state.role = action.payload.role;
      state.permissions = action.payload.permissions;
      state.status = 'authenticated';
      state.error = null;
      state.isContextReady = true;
      state.isSyncingContext = false;
    },
    setAuthError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    logout(state) {
      state.accessToken = null;
      state.user = null;
      state.role = null;
      state.permissions = null;
      state.status = 'idle';
      state.error = null;
      state.isContextReady = state.isRehydrated;
      state.isSyncingContext = false;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(syncAuthContextThunk.pending, (state) => {
        state.isSyncingContext = true;
        state.error = null;
        if (state.accessToken) {
          state.status = 'loading';
        }
      })
      .addCase(syncAuthContextThunk.fulfilled, (state) => {
        state.isSyncingContext = false;
        state.isContextReady = true;
        state.status = 'authenticated';
      })
      .addCase(syncAuthContextThunk.rejected, (state, action) => {
        state.isSyncingContext = false;
        state.isContextReady = true;
        state.error = action.error.message ?? 'Failed to refresh access context';
        state.status = state.accessToken ? 'authenticated' : 'idle';
      })
      .addCase(logoutThunk.pending, (state) => {
        state.loggingOut = true;
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        state.loggingOut = false;
      })
      .addCase(logoutThunk.rejected, (state) => {
        state.loggingOut = false;
      });
  }
});

export const { markAuthRehydrated, setAccessToken, setAuthContext, setAuthError, logout } = authSlice.actions;
export default authSlice.reducer;
