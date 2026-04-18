import { CompanyCreateInput, DEFAULT_CURRENCY_CODE, DEFAULT_TIMEZONE } from '@retailsync/shared';
import { CompanyModel } from '../models/Company';
import { InviteModel } from '../models/Invite';
import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';
import { AUTH_SESSION_DEFAULTS } from '../constants/config';
import { adminPermissions, memberPermissions, viewerPermissions } from '../utils/defaultPermissions';

const random = (len: number) =>
  Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);

const generateCompanyCode = async () => {
  for (let i = 0; i < 10; i += 1) {
    const candidate = `RS-${random(6)}`;
    const exists = await CompanyModel.exists({ code: candidate });
    if (!exists) {
      return candidate;
    }
  }
  throw new Error('Failed to generate unique company code');
};

const generateInviteCode = async () => {
  for (let i = 0; i < 10; i += 1) {
    const candidate = random(10);
    const exists = await InviteModel.exists({ code: candidate });
    if (!exists) {
      return candidate;
    }
  }
  throw new Error('Failed to generate invite code');
};

export const createCompanyForUser = async (params: {
  userId: string;
  payload: CompanyCreateInput;
}) => {
  const user = await UserModel.findById(params.userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (user.companyId) {
    throw new Error('User already belongs to a company');
  }

  const companyCode = await generateCompanyCode();
  const company = await CompanyModel.create({ ...params.payload, code: companyCode });

  const [adminRole, memberRole, viewerRole] = await RoleModel.create([
    {
      companyId: company._id,
      name: 'Admin',
      isSystem: true,
      permissions: adminPermissions()
    },
    {
      companyId: company._id,
      name: 'Member',
      isSystem: true,
      permissions: memberPermissions()
    },
    {
      companyId: company._id,
      name: 'Viewer',
      isSystem: true,
      permissions: viewerPermissions()
    }
  ]);

  user.companyId = company._id;
  user.roleId = adminRole._id;
  await user.save();

  const inviteCode = await generateInviteCode();
  await InviteModel.create({
    companyId: company._id,
    email: user.email,
    code: inviteCode,
    roleId: adminRole._id,
    expiresAt: new Date(Date.now() + AUTH_SESSION_DEFAULTS.inviteAcceptanceTtlMs),
    acceptedAt: new Date()
  });

  return {
    user,
    company,
    roles: [adminRole, memberRole, viewerRole] as const
  };
};

export const createCompanyFromQuickBooksOnboarding = async (params: {
  userId: string;
  companyName: string | null;
}) => {
  const user = await UserModel.findById(params.userId);
  if (!user) {
    throw new Error('User not found');
  }

  if (user.companyId) {
    return {
      companyId: user.companyId.toString(),
      created: false
    };
  }

  const created = await createCompanyForUser({
    userId: params.userId,
    payload: {
      name: params.companyName?.trim() || 'QuickBooks Company',
      businessType: 'Retail',
      address: 'Update later',
      phone: '0000000',
      email: user.email,
      timezone: DEFAULT_TIMEZONE,
      currency: DEFAULT_CURRENCY_CODE
    }
  });

  return {
    companyId: created.company._id.toString(),
    created: true
  };
};
