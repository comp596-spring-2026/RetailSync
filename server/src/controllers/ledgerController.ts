import {
  bulkApproveLedgerSchema,
  ledgerEntriesListQuerySchema,
  updateLedgerEntrySchema
} from '@retailsync/shared';
import { Request, Response } from 'express';
import { enqueueAccountingJob } from '../jobs/accountingQueue';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { StatementTransactionModel } from '../models/StatementTransaction';
import { fail, ok } from '../utils/apiResponse';

const normalizeBooleanQuery = (value: unknown) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return undefined;
};

const toLedgerDto = (entry: any) => ({
  id: entry._id.toString(),
  companyId: String(entry.companyId),
  sourceType: entry.sourceType,
  statementId: entry.statementId,
  statementTransactionId: entry.statementTransactionId,
  statementCheckId: entry.statementCheckId ?? undefined,
  date: entry.date,
  description: entry.description,
  merchant: entry.merchant ?? undefined,
  amount: Number(entry.amount),
  type: entry.type,
  balanceAfter: entry.balanceAfter != null ? Number(entry.balanceAfter) : undefined,
  attachments: {
    statementPdfPath: entry.attachments?.statementPdfPath ?? undefined,
    statementPageImagePath: entry.attachments?.statementPageImagePath ?? undefined,
    checkFrontPath: entry.attachments?.checkFrontPath ?? undefined,
    checkBackPath: entry.attachments?.checkBackPath ?? undefined
  },
  confidence: entry.confidence
    ? {
      imageQuality: entry.confidence.imageQuality,
      ocrConfidence: entry.confidence.ocrConfidence,
      fieldConfidence: entry.confidence.fieldConfidence,
      crossValidation: entry.confidence.crossValidation,
      overall: Number(entry.confidence.overall ?? 0)
    }
    : undefined,
  proposal: {
    qbTxnType: entry.proposal?.qbTxnType ?? undefined,
    bankAccountId: entry.proposal?.bankAccountId ?? undefined,
    categoryAccountId: entry.proposal?.categoryAccountId ?? undefined,
    payeeType: entry.proposal?.payeeType ?? undefined,
    payeeId: entry.proposal?.payeeId ?? undefined,
    payeeName: entry.proposal?.payeeName ?? undefined,
    transferTargetAccountId: entry.proposal?.transferTargetAccountId ?? undefined,
    memo: entry.proposal?.memo ?? '',
    confidence: Number(entry.proposal?.confidence ?? 0),
    reasons: Array.isArray(entry.proposal?.reasons) ? entry.proposal.reasons : [],
    status: entry.proposal?.status ?? 'proposed',
    version: entry.proposal?.version ?? 'v1'
  },
  reviewStatus: entry.reviewStatus,
  posting: {
    status: entry.posting?.status ?? 'not_posted',
    qbTxnId: entry.posting?.qbTxnId ?? undefined,
    error: entry.posting?.error ?? undefined,
    postedAt:
      entry.posting?.postedAt instanceof Date
        ? entry.posting.postedAt.toISOString()
        : undefined
  },
  updatedAt: entry.updatedAt instanceof Date ? entry.updatedAt.toISOString() : String(entry.updatedAt)
});

export const listLedgerEntries = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = ledgerEntriesListQuerySchema.safeParse({
    reviewStatus: typeof req.query.reviewStatus === 'string' ? req.query.reviewStatus : undefined,
    postingStatus: typeof req.query.postingStatus === 'string' ? req.query.postingStatus : undefined,
    hasCheck: normalizeBooleanQuery(req.query.hasCheck),
    type: typeof req.query.type === 'string' ? req.query.type : undefined,
    minConfidence: typeof req.query.minConfidence === 'string' ? req.query.minConfidence : undefined,
    startDate: typeof req.query.startDate === 'string' ? req.query.startDate : undefined,
    endDate: typeof req.query.endDate === 'string' ? req.query.endDate : undefined,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    limit: typeof req.query.limit === 'string' ? req.query.limit : undefined
  });

  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const filter: Record<string, unknown> = {
    companyId: req.companyId
  };

  if (parsed.data.reviewStatus) {
    filter.reviewStatus = parsed.data.reviewStatus;
  }
  if (parsed.data.postingStatus) {
    filter['posting.status'] = parsed.data.postingStatus;
  }
  if (parsed.data.hasCheck === true) {
    filter.statementCheckId = { $exists: true, $ne: null };
  } else if (parsed.data.hasCheck === false) {
    filter.$or = [
      { statementCheckId: { $exists: false } },
      { statementCheckId: null },
      { statementCheckId: '' }
    ];
  }
  if (parsed.data.type) {
    filter.type = parsed.data.type;
  }
  if (parsed.data.minConfidence != null) {
    filter['confidence.overall'] = { $gte: Number(parsed.data.minConfidence) };
  }
  if (parsed.data.startDate || parsed.data.endDate) {
    filter.date = {
      ...(parsed.data.startDate ? { $gte: parsed.data.startDate } : {}),
      ...(parsed.data.endDate ? { $lte: parsed.data.endDate } : {})
    };
  }
  if (parsed.data.search) {
    filter.$and = [
      ...(Array.isArray(filter.$and) ? (filter.$and as any[]) : []),
      {
        $or: [
          { description: { $regex: parsed.data.search, $options: 'i' } },
          { merchant: { $regex: parsed.data.search, $options: 'i' } },
          { 'proposal.memo': { $regex: parsed.data.search, $options: 'i' } }
        ]
      }
    ];
  }

  const entries = await LedgerEntryModel.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(parsed.data.limit ? Number(parsed.data.limit) : 300);

  return ok(res, { entries: entries.map(toLedgerDto) });
};

export const getLedgerEntryById = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const entry = await LedgerEntryModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!entry) {
    return fail(res, 'Ledger entry not found', 404);
  }

  return ok(res, { entry: toLedgerDto(entry) });
};

export const updateLedgerEntry = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = updateLedgerEntrySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const entry = await LedgerEntryModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!entry) {
    return fail(res, 'Ledger entry not found', 404);
  }

  if (entry.posting?.status === 'posted') {
    return fail(res, 'Posted entries cannot be edited', 409);
  }

  if (parsed.data.proposal) {
    entry.proposal = {
      ...(entry.proposal ?? {}),
      ...parsed.data.proposal,
      status: 'edited'
    } as any;
    entry.reviewStatus = 'edited' as any;
  }

  if (parsed.data.reviewStatus) {
    entry.reviewStatus = parsed.data.reviewStatus as any;
    entry.proposal = {
      ...(entry.proposal ?? {}),
      status: parsed.data.reviewStatus
    } as any;
  }

  await entry.save();

  await StatementTransactionModel.updateOne(
    {
      _id: entry.statementTransactionId,
      companyId: req.companyId
    },
    {
      $set: {
        proposal: entry.proposal,
        reviewStatus: entry.reviewStatus
      }
    }
  );

  return ok(res, { entry: toLedgerDto(entry) });
};

export const approveLedgerEntry = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const entry = await LedgerEntryModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!entry) {
    return fail(res, 'Ledger entry not found', 404);
  }

  if (entry.reviewStatus === 'excluded') {
    return fail(res, 'Excluded entries cannot be approved until edited', 409);
  }

  entry.reviewStatus = 'approved' as any;
  entry.proposal = {
    ...(entry.proposal ?? {}),
    status: 'approved'
  } as any;
  await entry.save();

  await StatementTransactionModel.updateOne(
    {
      _id: entry.statementTransactionId,
      companyId: req.companyId
    },
    {
      $set: {
        proposal: entry.proposal,
        reviewStatus: 'approved'
      }
    }
  );

  return ok(res, { entry: toLedgerDto(entry) });
};

export const excludeLedgerEntry = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const entry = await LedgerEntryModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!entry) {
    return fail(res, 'Ledger entry not found', 404);
  }

  if (entry.posting?.status === 'posted') {
    return fail(res, 'Posted entries cannot be excluded', 409);
  }

  entry.reviewStatus = 'excluded' as any;
  entry.proposal = {
    ...(entry.proposal ?? {}),
    status: 'excluded'
  } as any;
  await entry.save();

  await StatementTransactionModel.updateOne(
    {
      _id: entry.statementTransactionId,
      companyId: req.companyId
    },
    {
      $set: {
        proposal: entry.proposal,
        reviewStatus: 'excluded'
      }
    }
  );

  return ok(res, { entry: toLedgerDto(entry) });
};

export const bulkApproveLedgerEntries = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = bulkApproveLedgerSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const result = await LedgerEntryModel.updateMany(
    {
      _id: { $in: parsed.data.entryIds },
      companyId: req.companyId,
      reviewStatus: { $ne: 'excluded' },
      'posting.status': { $ne: 'posted' }
    },
    {
      $set: {
        reviewStatus: 'approved',
        'proposal.status': 'approved'
      }
    }
  );

  await StatementTransactionModel.updateMany(
    {
      _id: { $in: parsed.data.entryIds },
      companyId: req.companyId
    },
    {
      $set: {
        reviewStatus: 'approved',
        'proposal.status': 'approved'
      }
    }
  );

  return ok(res, {
    matched: result.matchedCount,
    approved: result.modifiedCount
  });
};

export const postApprovedLedgerEntries = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  try {
    const queue = await enqueueAccountingJob({
      companyId: req.companyId,
      jobType: 'quickbooks.post_approved',
      meta: {
        requestedBy: req.user.id,
        source: 'ledger.post-approved'
      }
    });

    return ok(res, { queue });
  } catch (error) {
    return fail(res, 'Failed to queue QuickBooks post-approved sync', 500, {
      error: String((error as Error).message)
    });
  }
};
