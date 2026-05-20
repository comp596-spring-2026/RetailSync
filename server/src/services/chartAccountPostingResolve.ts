import mongoose from 'mongoose';
import { findDefaultQuickBooksIncomeAccount } from '../integrations/quickbooks/client';
import { ChartOfAccountModel } from '../models/ChartOfAccount';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Resolves a chart-account reference (Mongo id, QB id, code, or name) to a QuickBooks Account Id.
 */
export const resolveChartAccountQbId = async (
  companyId: string,
  ref?: string | null
): Promise<string | undefined> => {
  const trimmed = String(ref ?? '').trim();
  if (!trimmed) return undefined;

  const orConditions: Record<string, unknown>[] = [{ qbAccountId: trimmed }, { code: trimmed }];
  if (mongoose.isValidObjectId(trimmed)) {
    orConditions.push({ _id: new mongoose.Types.ObjectId(trimmed) });
  }
  orConditions.push({ name: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') });

  const doc = await ChartOfAccountModel.findOne({
    companyId,
    $or: orConditions
  })
    .select('qbAccountId')
    .lean();

  const qbId = doc?.qbAccountId?.trim();
  if (qbId) return qbId;

  // QuickBooks entity ids are numeric strings; allow direct refs when cache is stale.
  if (/^\d+$/.test(trimmed)) return trimmed;

  return undefined;
};

/** Default income / deposit-line account for QuickBooks Deposit posting. */
export const resolveDefaultDepositLineQbId = async (companyId: string): Promise<string | undefined> => {
  const fromCache = await ChartOfAccountModel.findOne({
    companyId,
    type: { $in: ['revenue', 'income'] },
    qbAccountId: { $nin: [null, ''] }
  })
    .sort({ isSystem: 1, code: 1 })
    .select('qbAccountId')
    .lean();
  const cached = fromCache?.qbAccountId?.trim();
  if (cached) return cached;

  const live = await findDefaultQuickBooksIncomeAccount(companyId);
  return live?.trim() || undefined;
};

/** Default expense category for QuickBooks Expense / Check posting. */
export const resolveDefaultExpenseCategoryQbId = async (
  companyId: string
): Promise<string | undefined> => {
  const fromCache = await ChartOfAccountModel.findOne({
    companyId,
    type: 'expense',
    qbAccountId: { $nin: [null, ''] }
  })
    .sort({ isSystem: 1, code: 1 })
    .select('qbAccountId')
    .lean();
  return fromCache?.qbAccountId?.trim() || undefined;
};

/** Merges proposal patches without overwriting existing fields with `undefined`. */
export const mergeStatementProposal = <T extends Record<string, unknown>>(
  existing: T | undefined,
  patch?: Partial<T>
): T => {
  const merged = { ...(existing ?? {}) } as T;
  if (!patch) return merged;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  return merged;
};
