import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { userApi } from '../api';
import { fetchRoles } from '../../rbac/state';
import type { AppDispatch, RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';

export type UserItem = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  roleId: { _id: string; name: string; isSystem?: boolean } | null;
};

export type InviteItem = {
  _id: string;
  email: string;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt?: string;
  emailStatus?: string;
  roleId: { _id: string; name: string } | null;
};

type UsersState = {
  users: UserItem[];
  invites: InviteItem[];
  loading: boolean;
  mutating: boolean;
  error: string | null;
};

const initialState: UsersState = {
  users: [],
  invites: [],
  loading: false,
  mutating: false,
  error: null
};

export const fetchUsersPageData = createAsyncThunk<
  { users: UserItem[]; invites: InviteItem[] },
  void,
  { state: RootState; dispatch: AppDispatch }
>('users/fetchPageData', async (_, { dispatch }) => {
  const [usersRes, invitesRes] = await Promise.all([userApi.listUsers(), userApi.listInvites(), dispatch(fetchRoles())]);
  return {
    users: usersRes.data.data as UserItem[],
    invites: invitesRes.data.data as InviteItem[]
  };
});

export const createInviteThunk = createAsyncThunk<
  void,
  { email: string; roleId: string; expiresInDays?: number },
  { dispatch: AppDispatch }
>('users/createInvite', async (payload, { dispatch }) => {
  await userApi.createInvite(payload);
  dispatch(showSnackbar({ message: 'Invite sent successfully', severity: 'success' }));
  await dispatch(fetchUsersPageData());
});

export const updateUserThunk = createAsyncThunk<
  void,
  { userId: string; firstName: string; lastName: string },
  { dispatch: AppDispatch }
>('users/updateUser', async (payload, { dispatch }) => {
  await userApi.updateUser(payload.userId, {
    firstName: payload.firstName,
    lastName: payload.lastName
  });
  dispatch(showSnackbar({ message: 'Member updated', severity: 'success' }));
  await dispatch(fetchUsersPageData());
});

export const assignRoleThunk = createAsyncThunk<
  void,
  { userId: string; roleId: string },
  { dispatch: AppDispatch }
>('users/assignRole', async (payload, { dispatch }) => {
  await userApi.assignRole(payload.userId, payload.roleId);
  dispatch(showSnackbar({ message: 'Role updated', severity: 'success' }));
  await dispatch(fetchUsersPageData());
});

export const deleteUserThunk = createAsyncThunk<void, string, { dispatch: AppDispatch }>(
  'users/deleteUser',
  async (userId, { dispatch }) => {
    await userApi.deleteUser(userId);
    dispatch(showSnackbar({ message: 'Member removed from organization', severity: 'success' }));
    await dispatch(fetchUsersPageData());
  }
);

export const deleteInviteThunk = createAsyncThunk<void, string, { dispatch: AppDispatch }>(
  'users/deleteInvite',
  async (inviteId, { dispatch }) => {
    await userApi.deleteInvite(inviteId);
    dispatch(showSnackbar({ message: 'Invite revoked', severity: 'success' }));
    await dispatch(fetchUsersPageData());
  }
);

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {},
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
      .addMatcher(
        (action) =>
          [
            createInviteThunk.pending.type,
            updateUserThunk.pending.type,
            assignRoleThunk.pending.type,
            deleteUserThunk.pending.type,
            deleteInviteThunk.pending.type
          ].includes(action.type),
        (state) => {
          state.mutating = true;
        }
      )
      .addMatcher(
        (action) =>
          [
            createInviteThunk.fulfilled.type,
            createInviteThunk.rejected.type,
            updateUserThunk.fulfilled.type,
            updateUserThunk.rejected.type,
            assignRoleThunk.fulfilled.type,
            assignRoleThunk.rejected.type,
            deleteUserThunk.fulfilled.type,
            deleteUserThunk.rejected.type,
            deleteInviteThunk.fulfilled.type,
            deleteInviteThunk.rejected.type
          ].includes(action.type),
        (state) => {
          state.mutating = false;
        }
      );
  }
});

export const selectUsers = (state: RootState) => state.users.users;
export const selectInvites = (state: RootState) => state.users.invites;
export const selectUsersLoading = (state: RootState) => state.users.loading;
export const selectUsersMutating = (state: RootState) => state.users.mutating;
export const selectUsersError = (state: RootState) => state.users.error;

export default usersSlice.reducer;
