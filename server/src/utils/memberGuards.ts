import { assertNotRemovingLastAdmin, countActiveUsersWithRole, findCompanyAdminRole } from './adminRoleGuard';

export const PROTECTED_ADMIN_MESSAGE = 'Protected admin account cannot be edited or removed.';

type RoleRef = { isSystem?: boolean; name?: string } | null | undefined;

export const isProtectedAdminRole = (role: RoleRef) =>
  Boolean(role?.isSystem === true && String(role.name ?? '').trim().toLowerCase() === 'admin');

export const getPopulatedRole = (roleId: unknown): RoleRef => {
  if (roleId && typeof roleId === 'object' && 'name' in roleId) {
    return roleId as RoleRef;
  }
  return null;
};

export const isProtectedAdminMember = (user: { roleId?: unknown }) =>
  isProtectedAdminRole(getPopulatedRole(user.roleId));

export const assertNotDeletingLastAdmin = async (params: {
  companyId: string;
  currentRoleId: string | null | undefined;
}) => {
  const adminRole = await findCompanyAdminRole(params.companyId);
  if (!adminRole) {
    return null;
  }

  const adminRoleId = adminRole._id.toString();
  if (params.currentRoleId?.toString() !== adminRoleId) {
    return null;
  }

  const adminCount = await countActiveUsersWithRole(params.companyId, adminRoleId);
  if (adminCount <= 1) {
    return 'Cannot remove the last admin from the company.';
  }

  return null;
};

export const assertMemberRoleChangeAllowed = async (params: {
  companyId: string;
  userId: string;
  currentRoleId: string | null | undefined;
  nextRoleId: string;
  targetUser: { roleId?: unknown };
}) => {
  if (isProtectedAdminMember(params.targetUser)) {
    return PROTECTED_ADMIN_MESSAGE;
  }

  return assertNotRemovingLastAdmin({
    companyId: params.companyId,
    userId: params.userId,
    currentRoleId: params.currentRoleId,
    nextRoleId: params.nextRoleId
  });
};
