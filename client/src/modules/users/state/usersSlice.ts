import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { userApi } from '../api';
import { fetchRoles } from '../../rbac/state';
import type { RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';

export type UserItem = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: { _id: string; name: string } | null;
};

export type InviteItem = {
  _id: string;
  email: string;
  code: string;
  acceptedAt: string | null;
  roleId: { _id: string; name: string } | null;
};

type UsersState = {
  users: UserItem[];
  invites: InviteItem[];
  loading: boolean;
  mutating: boolean;
  error: string | null;
  inviteCode: string;
};

const initialState: UsersState = {
  users: [],
  invites: [],
  loading: false,
  mutating: false,
  error: null,
  inviteCode: ''
};

export const fetchUsersPageData = createAsyncThunk<
  { users: UserItem[]; invites: InviteItem[] },
  void,
  { state: RootState }
>('users/fetchPageData', async (_, { dispatch }) => {
  const [usersRes, invitesRes] = await Promise.all([userApi.listUsers(), userApi.listInvites(), dispatch(fetchRoles())]);
  return {
    users: usersRes.data.data as UserItem[],
    invites: invitesRes.data.data as InviteItem[]
  };
});

export const createInviteThunk = createAsyncThunk<
  string,
  { email: string; roleId: string; expiresInDays?: number }
>('users/createInvite', async (payload, { dispatch }) => {
  const res = await userApi.createInvite(payload);
  dispatch(showSnackbar({ message: 'Invite created', severity: 'success' }));
  await dispatch(fetchUsersPageData());
  return String(res.data.data.inviteCode ?? '');
});

export const assignRoleThunk = createAsyncThunk<
  void,
  { userId: string; roleId: string }
>('users/assignRole', async (payload, { dispatch }) => {
  await userApi.assignRole(payload.userId, payload.roleId);
  dispatch(showSnackbar({ message: 'Role updated', severity: 'success' }));
  await dispatch(fetchUsersPageData());
});

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearInviteCode(state) {
      state.inviteCode = '';
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsersPageData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsersPageData.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload.users;
        state.invites = action.payload.invites;
      })
      .addCase(fetchUsersPageData.rejected, (state) => {
        state.loading = false;
        state.error = 'Failed to load users';
      })
      .addCase(createInviteThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(createInviteThunk.fulfilled, (state, action) => {
        state.mutating = false;
        state.inviteCode = action.payload;
      })
      .addCase(createInviteThunk.rejected, (state) => {
        state.mutating = false;
      })
      .addCase(assignRoleThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(assignRoleThunk.fulfilled, (state) => {
        state.mutating = false;
      })
      .addCase(assignRoleThunk.rejected, (state) => {
        state.mutating = false;
      });
  }
});

export const { clearInviteCode } = usersSlice.actions;
export const selectUsers = (state: RootState) => state.users.users;
export const selectInvites = (state: RootState) => state.users.invites;
export const selectUsersLoading = (state: RootState) => state.users.loading;
export const selectUsersMutating = (state: RootState) => state.users.mutating;
export const selectUsersError = (state: RootState) => state.users.error;
export const selectInviteCode = (state: RootState) => state.users.inviteCode;

export default usersSlice.reducer;
