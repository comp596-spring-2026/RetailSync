export {
  default,
  default as rbacReducer,
  deleteRoleThunk,
  fetchRoles,
  saveRoleThunk,
  selectRbacError,
  selectRbacLoading,
  selectRbacModules,
  selectRbacMutating,
  selectRoles,
  setModules,
  setRoles,
  setSelectedRole
} from './rbacSlice';
export type { RoleItem } from './rbacSlice';
