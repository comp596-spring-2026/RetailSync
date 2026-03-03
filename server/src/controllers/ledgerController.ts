import { Request, Response } from 'express';
import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { ensureDefaultChartOfAccounts } from '../services/ledgerService';
import { fail, ok } from '../utils/apiResponse';

export const listChartOfAccounts = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  await ensureDefaultChartOfAccounts(req.companyId);
  const accounts = await ChartOfAccountModel.find({ companyId: req.companyId }).sort({ code: 1 });
  return ok(res, { accounts });
};

export const seedChartOfAccounts = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  await ensureDefaultChartOfAccounts(req.companyId);
  const count = await ChartOfAccountModel.countDocuments({ companyId: req.companyId });
  return ok(res, { seeded: true, count });
};

export const listLedgerEntries = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const filter: Record<string, unknown> = { companyId: req.companyId };
  if (status && ['draft', 'posted', 'reversed'].includes(status)) {
    filter.status = status;
  }

  const entries = await LedgerEntryModel.find(filter).sort({ date: -1, createdAt: -1 }).limit(300);
  return ok(res, { entries });
};

export const postLedgerEntry = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) return fail(res, 'Company onboarding required', 403);

  const entry = await LedgerEntryModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!entry) {
    return fail(res, 'Ledger entry not found', 404);
  }
  if (entry.status !== 'draft') {
    return fail(res, 'Only draft entries can be posted', 409);
  }

  entry.status = 'posted' as any;
  entry.postedBy = req.user.id as any;
  entry.postedAt = new Date();
  await entry.save();
  return ok(res, { entry });
};
