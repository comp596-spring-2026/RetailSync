import { inviteCreateSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { CompanyModel } from '../models/Company';
import { InviteModel } from '../models/Invite';
import { RoleModel } from '../models/Role';
import { fail, ok } from '../utils/apiResponse';
import { sendInviteEmail } from '../services/mailer';

const randomInviteCode = async () => {
  for (let i = 0; i < 10; i += 1) {
    const code = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    const exists = await InviteModel.exists({ code });
    if (!exists) return code;
  }
  throw new Error('Failed to generate invite code');
};

export const createInvite = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = inviteCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const role = await RoleModel.findOne({ _id: parsed.data.roleId, companyId: req.companyId });
  if (!role) {
    return fail(res, 'Role not found', 404);
  }

  const company = await CompanyModel.findById(req.companyId).lean();
  if (!company) {
    return fail(res, 'Company not found', 404);
  }

  const code = await randomInviteCode();
  const invite = await InviteModel.create({
    companyId: req.companyId,
    email: parsed.data.email,
    code,
    roleId: role._id,
    expiresAt: new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
  });

  const inviteeName = parsed.data.email.split('@')[0]?.split(/[._-]/)[0] || 'there';

  try {
    invite.emailLastAttemptAt = new Date();
    await sendInviteEmail({
      email: invite.email,
      firstName: inviteeName,
      companyName: company.name,
      inviteCode: invite.code,
      roleName: String(role.name)
    });

    invite.emailStatus = 'sent';
    invite.emailSentAt = new Date();
    invite.emailLastAttemptAt = new Date();
    invite.emailLastError = null;
    await invite.save();
  } catch (error) {
    await InviteModel.deleteOne({ _id: invite._id });
    return fail(
      res,
      error instanceof Error ? error.message : 'Failed to send invite email',
      503
    );
  }

  return ok(res, { inviteCode: invite.code, invite }, 201);
};

export const listInvites = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const invites = await InviteModel.find({ companyId: req.companyId }).populate('roleId', 'name').sort({ createdAt: -1 });
  return ok(res, invites);
};

export const deleteInvite = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const invite = await InviteModel.findOneAndDelete({ _id: req.params.id, companyId: req.companyId });
  if (!invite) {
    return fail(res, 'Invite not found', 404);
  }

  return ok(res, { deleted: true });
};
