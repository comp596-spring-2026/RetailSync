import { ModuleKey, PermissionsMap, moduleKeys } from '@retailsync/shared';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { rbacApi } from '../api';
import type { AppDispatch, RootState } from '../../../app/store';
import { showSnackbar } from '../../../app/store/uiSlice';

export type RoleItem = {
  _id: string;
  name: string;
  isSystem: boolean;
  permissions: PermissionsMap;
};

type RbacState = {
  modules: ModuleKey[];
  roles: RoleItem[];
  selectedRole: RoleItem | null;
  loading: boolean;
  mutating: boolean;
  error: string | null;
};

const initialState: RbacState = {
  modules: [...moduleKeys],
  roles: [],
  selectedRole: null,
  loading: false,
  mutating: false,
  error: null
};

export const fetchRoles = createAsyncThunk<{ modules: ModuleKey[]; roles: RoleItem[] }>(
  'rbac/fetchRoles',
  async () => {
    const [modulesRes, rolesRes] = await Promise.all([rbacApi.modules(), rbacApi.listRoles()]);
    return {
      modules: ((modulesRes.data.data.modules as ModuleKey[] | undefined) ?? [...moduleKeys]).slice(),
      roles: rolesRes.data.data as RoleItem[]
    };
  }
);

export const saveRoleThunk = createAsyncThunk<
  void,
  { id?: string; name: string; permissions: PermissionsMap },
  { dispatch: AppDispatch }
>('rbac/saveRole', async (payload, { dispatch }) => {
  if (payload.id) {
    await rbacApi.updateRole(payload.id, { name: payload.name, permissions: payload.permissions });
    dispatch(showSnackbar({ message: 'Role updated', severity: 'success' }));
  } else {
    await rbacApi.createRole({ name: payload.name, permissions: payload.permissions });
    dispatch(showSnackbar({ message: 'Role created', severity: 'success' }));
  }
  await dispatch(fetchRoles());
});

export const deleteRoleThunk = createAsyncThunk<void, string, { dispatch: AppDispatch }>(
  'rbac/deleteRole',
  async (id, { dispatch }) => {
    await rbacApi.deleteRole(id);
    dispatch(showSnackbar({ message: 'Role deleted', severity: 'success' }));
    dispatch(setSelectedRole(null));
    await dispatch(fetchRoles());
  }
);

const rbacSlice = createSlice({
  name: 'rbac',
  initialState,
  reducers: {
    setModules(state, action: PayloadAction<ModuleKey[]>) {
      state.modules = action.payload;
    },
    setRoles(state, action: PayloadAction<RoleItem[]>) {
      state.roles = action.payload;
    },
    setSelectedRole(state, action: PayloadAction<RoleItem | null>) {
      state.selectedRole = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRoles.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRoles.fulfilled, (state, action) => {
        state.loading = false;
        state.modules = action.payload.modules;
        state.roles = action.payload.roles;
      })
      .addCase(fetchRoles.rejected, (state) => {
        state.loading = false;
        state.error = 'Failed to load roles';
      })
      .addCase(saveRoleThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(saveRoleThunk.fulfilled, (state) => {
        state.mutating = false;
      })
      .addCase(saveRoleThunk.rejected, (state) => {
        state.mutating = false;
      })
      .addCase(deleteRoleThunk.pending, (state) => {
        state.mutating = true;
      })
      .addCase(deleteRoleThunk.fulfilled, (state) => {
        state.mutating = false;
      })
      .addCase(deleteRoleThunk.rejected, (state) => {
        state.mutating = false;
      });
  }
});

export const { setModules, setRoles, setSelectedRole } = rbacSlice.actions;
export const selectRoles = (state: RootState) => state.rbac.roles;
export const selectRbacModules = (state: RootState) => state.rbac.modules;
export const selectRbacLoading = (state: RootState) => state.rbac.loading;
export const selectRbacMutating = (state: RootState) => state.rbac.mutating;
export const selectRbacError = (state: RootState) => state.rbac.error;
export default rbacSlice.reducer;
