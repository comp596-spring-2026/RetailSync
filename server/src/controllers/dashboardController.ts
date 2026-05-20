import { Request, Response } from 'express';
import { CompanyModel } from '../models/Company';
import { fail, ok } from '../utils/apiResponse';

export const getDashboardSummary = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const company = await CompanyModel.findById(req.companyId).lean();
  return ok(res, {
    companyId: req.companyId,
    companyName: company?.name ?? null
  });
};
