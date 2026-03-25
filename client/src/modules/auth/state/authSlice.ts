import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PermissionsMap } from '@retailsync/shared';
import { authApi } from '../api';
import { clearCompany } from '../../users/state';

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
};

const initialState: AuthState = {
  accessToken: null,
  user: null,
  role: null,
  permissions: null,
  status: 'idle',
  error: null,
  loggingOut: false
};

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
    setAccessToken(state, action: PayloadAction<string | null>) {
      state.accessToken = action.payload;
      if (action.payload) {
        state.status = 'authenticated';
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
    }
  },
  extraReducers: (builder) => {
    builder
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

export const { setAccessToken, setAuthContext, setAuthError, logout } = authSlice.actions;
export default authSlice.reducer;
