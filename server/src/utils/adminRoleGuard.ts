import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';

/** System Admin role only: must be `isSystem` and named Admin (case-insensitive). Custom roles named Admin are ignored. */
export const findCompanyAdminRole = async (companyId: string) => {
  const roles = await RoleModel.find({ companyId, isSystem: true }).lean();
  return (
    roles.find(
      (role) => role.isSystem === true && String(role.name ?? '').trim().toLowerCase() === 'admin'
    ) ?? null
  );
};

export const countActiveUsersWithRole = async (companyId: string, roleId: string) =>
  UserModel.countDocuments({ companyId, roleId, isActive: true });

export const assertNotRemovingLastAdmin = async (params: {
  companyId: string;
  userId: string;
  currentRoleId: string | null | undefined;
  nextRoleId: string;
}) => {
  const adminRole = await findCompanyAdminRole(params.companyId);
  if (!adminRole) {
    return null;
  }

  const adminRoleId = adminRole._id.toString();
  if (params.currentRoleId?.toString() !== adminRoleId) {
    return null;
  }

  if (params.nextRoleId === adminRoleId) {
    return null;
  }

  const adminCount = await countActiveUsersWithRole(params.companyId, adminRoleId);
  if (adminCount <= 1) {
    return 'Cannot remove the last admin from the company.';
  }

  return null;
};
