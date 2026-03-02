import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PermissionsMap } from '@retailsync/shared';

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
};

const initialState: AuthState = {
  accessToken: null,
  user: null,
  role: null,
  permissions: null,
  status: 'idle',
  error: null
};

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
  }
});

export const { setAccessToken, setAuthContext, setAuthError, logout } = authSlice.actions;
export default authSlice.reducer;
