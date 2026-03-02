import { ModuleKey, PermissionsMap } from '@retailsync/shared';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
};

const initialState: RbacState = {
  modules: [],
  roles: [],
  selectedRole: null
};

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
  }
});

export const { setModules, setRoles, setSelectedRole } = rbacSlice.actions;
export default rbacSlice.reducer;
