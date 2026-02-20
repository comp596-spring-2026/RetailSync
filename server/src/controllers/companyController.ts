import { companyCreateSchema, companyJoinSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { CompanyModel } from '../models/Company';
import { InviteModel } from '../models/Invite';
import { RoleModel } from '../models/Role';
import { UserModel } from '../models/User';
import { fail, ok } from '../utils/apiResponse';
import { adminPermissions, memberPermissions, viewerPermissions } from '../utils/defaultPermissions';

const random = (len: number) => Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, len);

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

export const createCompany = async (req: Request, res: Response) => {
  if (!req.user) {
    return fail(res, 'Unauthorized', 401);
  }

  const parsed = companyCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const user = await UserModel.findById(req.user.id);
  if (!user) {
    return fail(res, 'User not found', 404);
  }

  if (user.companyId) {
    return fail(res, 'User already belongs to a company', 409);
  }

  const companyCode = await generateCompanyCode();
  const company = await CompanyModel.create({ ...parsed.data, code: companyCode });

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
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    acceptedAt: new Date()
  });

  return ok(res, { company, roles: [adminRole, memberRole, viewerRole] }, 201);
};

export const joinCompany = async (req: Request, res: Response) => {
  if (!req.user) {
    return fail(res, 'Unauthorized', 401);
  }

  const parsed = companyJoinSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (parsed.data.email !== req.user.email) {
    return fail(res, 'Email mismatch for authenticated user', 403);
  }

  const user = await UserModel.findById(req.user.id);
  if (!user) {
    return fail(res, 'User not found', 404);
  }

  if (user.companyId) {
    return fail(res, 'User already belongs to a company', 409);
  }

  const company = await CompanyModel.findOne({ code: parsed.data.companyCode });
  if (!company) {
    return fail(res, 'Company not found', 404);
  }

  const invite = await InviteModel.findOne({
    companyId: company._id,
    email: parsed.data.email,
    code: parsed.data.inviteCode,
    acceptedAt: null
  });

  if (!invite) {
    return fail(res, 'Invalid invite', 400);
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    return fail(res, 'Invite expired', 400);
  }

  const role = await RoleModel.findOne({ _id: invite.roleId, companyId: company._id });
  if (!role) {
    return fail(res, 'Invite role not found', 400);
  }

  user.companyId = company._id;
  user.roleId = role._id;
  invite.acceptedAt = new Date();

  await Promise.all([user.save(), invite.save()]);

  return ok(res, { company, role });
};

export const myCompany = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const company = await CompanyModel.findById(req.companyId);
  if (!company) {
    return fail(res, 'Company not found', 404);
  }

  return ok(res, company);
};
