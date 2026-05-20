import type { PermissionsMap } from '@retailsync/shared';
import { hasPermission } from '../../../utils/permissions';

export type MemberRoleRef = {
  _id: string;
  name: string;
  isSystem?: boolean;
} | null;

export type MemberUser = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  roleId: MemberRoleRef;
};

export type AuthUserRef = {
  _id?: string;
  id?: string;
};

export const isProtectedAdminRole = (role: MemberRoleRef | undefined | null) =>
  Boolean(role?.isSystem === true && String(role.name ?? '').trim().toLowerCase() === 'admin');

export const isProtectedAdminMember = (member: Pick<MemberUser, 'roleId'>) =>
  isProtectedAdminRole(member.roleId);

export const isCurrentUser = (member: Pick<MemberUser, '_id'>, currentUser: AuthUserRef | null | undefined) => {
  const currentId = currentUser?._id ?? currentUser?.id;
  if (!currentId || !member._id) return false;
  return String(currentId) === String(member._id);
};

export const canEditMember = (
  member: MemberUser,
  currentUser: AuthUserRef | null | undefined,
  permissions: PermissionsMap | null | undefined
) => {
  if (!hasPermission(permissions, 'users', 'edit')) return false;
  if (isProtectedAdminMember(member)) return false;
  return true;
};

export const canDeleteMember = (
  member: MemberUser,
  currentUser: AuthUserRef | null | undefined,
  permissions: PermissionsMap | null | undefined
) => {
  if (!hasPermission(permissions, 'users', 'delete')) return false;
  if (isCurrentUser(member, currentUser)) return false;
  if (isProtectedAdminMember(member)) return false;
  if (member.isActive === false) return false;
  return true;
};

export const canAssignMemberRole = (
  member: MemberUser,
  currentUser: AuthUserRef | null | undefined,
  permissions: PermissionsMap | null | undefined
) => {
  if (!hasPermission(permissions, 'users', 'actions:assignRole')) return false;
  if (isCurrentUser(member, currentUser)) return false;
  if (isProtectedAdminMember(member)) return false;
  return true;
};

export const memberStatusLabel = (member: Pick<MemberUser, 'isActive'>) =>
  member.isActive === false ? 'Inactive' : 'Active';
