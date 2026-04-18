import { companyCreateSchema, companyJoinSchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { UserModel } from '../models/User';
import { CompanyModel } from '../models/Company';
import { InviteModel } from '../models/Invite';
import { RoleModel } from '../models/Role';
import { fail, ok } from '../utils/apiResponse';
import {
  buildQuickBooksOnboardingConnectUrl,
  getPendingQuickBooksOnboarding,
  claimPendingQuickBooksOnboarding,
  quickBooksOAuthCookieOptions,
  quickbooksOauthStateCookie
} from '../services/quickbooks/applicationService';
import { createCompanyForUser } from '../services/companyOnboardingService';

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

  const created = await createCompanyForUser({
    userId: req.user.id,
    payload: parsed.data
  });

  const quickbooks = await claimPendingQuickBooksOnboarding({
    userId: created.user._id.toString(),
    companyId: created.company._id.toString()
  });

  return ok(res, { company: created.company, roles: created.roles, quickbooks }, 201);
};

export const getQuickBooksOnboardingStatus = async (req: Request, res: Response) => {
  if (!req.user) {
    return fail(res, 'Unauthorized', 401);
  }

  return ok(res, {
    quickbooks: await getPendingQuickBooksOnboarding(req.user.id)
  });
};

export const startQuickBooksOnboarding = async (req: Request, res: Response) => {
  if (!req.user) {
    return fail(res, 'Unauthorized', 401);
  }

  if (req.user.companyId) {
    return fail(res, 'User already belongs to a company', 409);
  }

  const returnTo =
    typeof req.body?.returnTo === 'string'
      ? req.body.returnTo
      : '/onboarding/create-company';

  try {
    const built = await buildQuickBooksOnboardingConnectUrl({
      userId: req.user.id,
      returnToPath: returnTo
    });
    res.cookie(
      quickbooksOauthStateCookie,
      built.nonce,
      quickBooksOAuthCookieOptions()
    );
    return ok(res, { url: built.url, environment: built.environment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks OAuth setup failed';
    const status = message === 'Unauthorized' ? 401 : 501;
    return fail(res, message, status);
  }
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
