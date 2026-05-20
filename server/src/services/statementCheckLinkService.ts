import { inferDefaultQuickBooksTxnType } from '@retailsync/shared';
import type { HydratedDocument } from 'mongoose';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { StatementCheckModel, type StatementCheckDoc } from '../models/StatementCheck';
import { StatementTransactionModel, type StatementTransactionDoc } from '../models/StatementTransaction';
import { buildMatchingProposal } from './matchingEngine';

type StatementTxn = HydratedDocument<StatementTransactionDoc>;
type StatementCheck = HydratedDocument<StatementCheckDoc>;

const firstNonBlank = (...values: Array<unknown>): string => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const normalizeText = (value?: string) => String(value ?? '').trim().toLowerCase();

const clearedCheckLookupKey = (args: {
  checkNumber?: string;
  amount: number;
  postDate?: string;
}) => `${(args.checkNumber ?? '').trim()}::${Number(args.amount ?? 0).toFixed(2)}::${args.postDate ?? ''}`;

const readCheckFields = (check: Pick<StatementCheck, 'extracted' | 'autoFill'>) => {
  const checkNumber = firstNonBlank(check.extracted?.checkNumber, check.autoFill?.checkNumber);
  const postDate = firstNonBlank(check.extracted?.date, check.autoFill?.date);
  const payeeName = firstNonBlank(check.extracted?.payeeName, check.autoFill?.payeeName);
  const memo = firstNonBlank(check.extracted?.memo, check.autoFill?.memo);
  const amount = Number(check.extracted?.amount ?? check.autoFill?.amount ?? 0);
  const description =
    payeeName || (checkNumber ? `Check ${checkNumber}` : '') || memo || 'Check payment';
  return { checkNumber, postDate, payeeName, memo, amount, description };
};

const backfillCheckTransactionLink = async (args: {
  companyId: string;
  statementId: string;
  check: StatementCheck;
  entry: StatementTxn;
  statementPdfPath?: string;
  checkFrontPath?: string;
}) => {
  const checkId = args.check._id.toString();
  const txnId = args.entry._id.toString();

  if (args.entry.statementCheckId !== checkId) {
    args.entry.statementCheckId = checkId;
    await args.entry.save();
  }

  const checkDoc = await StatementCheckModel.findOne({
    _id: checkId,
    companyId: args.companyId,
    statementId: args.statementId
  });
  if (checkDoc) {
    const reasons = Array.isArray(checkDoc.match?.reasons) ? [...checkDoc.match.reasons] : [];
    if (!reasons.includes('Linked during statement review approval')) {
      reasons.push('Linked during statement review approval');
    }
    checkDoc.match = {
      ...(checkDoc.match ?? {}),
      statementTransactionId: txnId,
      matchConfidence: Math.max(Number(checkDoc.match?.matchConfidence ?? 0), 0.85),
      reasons
    } as typeof checkDoc.match;
    await checkDoc.save();
  }

  const ledgerFilter = {
    companyId: args.companyId,
    statementId: args.statementId,
    statementTransactionId: txnId
  };

  const existingLedger = await LedgerEntryModel.findOne(ledgerFilter);
  if (existingLedger) {
    if (existingLedger.statementCheckId !== checkId) {
      existingLedger.statementCheckId = checkId;
      await existingLedger.save();
    }
    return;
  }

  const proposal = args.entry.proposal ?? {};
  const confidence = Number(proposal.confidence ?? args.entry.classificationConfidence ?? 0.55);
  await LedgerEntryModel.create({
    companyId: args.companyId,
    sourceType: 'statement',
    statementId: args.statementId,
    statementTransactionId: txnId,
    statementCheckId: checkId,
    date: args.entry.postDate,
    description: args.entry.description,
    merchant: args.entry.merchant,
    amount: args.entry.amount,
    type: args.entry.type,
    attachments: {
      statementPdfPath: args.statementPdfPath ?? null,
      checkFrontPath: args.checkFrontPath ?? null,
      checkCropPath: args.checkFrontPath ?? null
    },
    confidence: {
      overall: confidence,
      crossValidation: confidence
    },
    proposal: {
      ...proposal,
      status: proposal.status ?? args.entry.reviewStatus ?? 'proposed'
    },
    reviewStatus: args.entry.reviewStatus ?? 'proposed',
    posting: args.entry.posting ?? { status: 'not_posted' }
  });
};

const findClearedCheckTransaction = async (args: {
  companyId: string;
  statementId: string;
  checkNumber?: string;
  amount: number;
  postDate?: string;
}): Promise<StatementTxn | null> => {
  const key = clearedCheckLookupKey(args);
  const candidates = await StatementTransactionModel.find({
    companyId: args.companyId,
    statementId: args.statementId,
    rowType: 'check_cleared'
  });

  for (const txn of candidates) {
    const candidateKey = clearedCheckLookupKey({
      checkNumber: txn.checkNumber ?? undefined,
      amount: Number(txn.amount ?? 0),
      postDate: txn.postDate ?? undefined
    });
    if (candidateKey === key) return txn;
  }
  return null;
};

const createStatementEntryFromCheck = async (args: {
  companyId: string;
  statementId: string;
  checkId: string;
  check: StatementCheck;
  statementBankAccountId?: string;
  statementPdfPath?: string;
}): Promise<StatementTxn> => {
  const fields = readCheckFields(args.check);
  const postDate = fields.postDate || new Date().toISOString().slice(0, 10);
  const matchingProposal = await buildMatchingProposal({
    companyId: args.companyId,
    description: fields.description,
    merchant: fields.payeeName || undefined,
    amount: fields.amount,
    type: 'debit',
    check: {
      payeeName: fields.payeeName || undefined,
      amount: fields.amount,
      extracted: {
        checkNumber: fields.checkNumber || undefined,
        date: fields.postDate || undefined,
        payeeName: fields.payeeName || undefined,
        amount: fields.amount,
        memo: fields.memo || undefined
      }
    }
  });

  const qbTxnType =
    matchingProposal.qbTxnType ??
    inferDefaultQuickBooksTxnType({
      type: 'debit',
      section: 'checks_cleared',
      transactionFamily: 'check',
      rowType: 'check_cleared',
      description: fields.description
    });

  const proposal = {
    qbTxnType,
    bankAccountId: args.statementBankAccountId || undefined,
    categoryAccountId: matchingProposal.categoryAccountId,
    payeeType: matchingProposal.payeeType,
    payeeId: matchingProposal.payeeId,
    payeeName: matchingProposal.payeeName ?? fields.payeeName ?? undefined,
    checkNumber: fields.checkNumber || undefined,
    memo: matchingProposal.memo ?? fields.memo ?? '',
    confidence: matchingProposal.confidence,
    reasons: [
      ...matchingProposal.reasons,
      'Created from check review because no statement transaction link existed'
    ],
    status: 'proposed' as const,
    version: 'v1' as const
  };

  const frontPath = String(args.check.gcs?.frontPath ?? '').trim() || undefined;
  const createdTxn = await StatementTransactionModel.create({
    statementId: args.statementId,
    companyId: args.companyId,
    postDate,
    description: fields.description,
    merchant: fields.payeeName || undefined,
    amount: fields.amount,
    type: 'debit',
    rowType: 'check_cleared',
    section: 'checks_cleared',
    transactionFamily: 'check',
    isPostingCandidate: true,
    normalizedDescription: normalizeText(fields.description),
    counterparty: fields.payeeName || undefined,
    classification: 'check',
    classificationConfidence: matchingProposal.confidence,
    suggestedAction: 'create_check',
    checkNumber: fields.checkNumber || undefined,
    statementCheckId: args.checkId,
    sourceLocator: {
      pageNumber: args.check.artifacts?.pageNumber ?? undefined,
      sourceText: fields.memo || fields.description
    },
    evidence: {
      statementPdfPath: args.statementPdfPath,
      checkCropPath: frontPath,
      geminiPath: args.check.artifacts?.geminiPath ?? undefined
    },
    proposal,
    reviewStatus: 'proposed',
    posting: { status: 'not_posted' }
  });

  await LedgerEntryModel.create({
    companyId: args.companyId,
    sourceType: 'statement',
    statementId: args.statementId,
    statementTransactionId: createdTxn._id.toString(),
    statementCheckId: args.checkId,
    date: postDate,
    description: fields.description,
    merchant: fields.payeeName || undefined,
    amount: fields.amount,
    type: 'debit',
    attachments: {
      statementPdfPath: args.statementPdfPath ?? null,
      checkFrontPath: frontPath ?? null,
      checkCropPath: frontPath ?? null,
      geminiPath: args.check.artifacts?.geminiPath ?? null
    },
    confidence: {
      overall: matchingProposal.confidence,
      crossValidation: matchingProposal.confidence
    },
    proposal: { ...proposal, status: 'proposed' },
    reviewStatus: 'proposed',
    posting: { status: 'not_posted' }
  });

  return createdTxn;
};

export type ResolveStatementEntryForCheckResult =
  | { ok: true; entry: StatementTxn; linked: 'existing' | 'matched' | 'created' }
  | { ok: false; error: string; status: number; details?: Record<string, unknown> };

export const resolveStatementEntryForCheckSuggestion = async (args: {
  companyId: string;
  statementId: string;
  checkId: string;
  statement?: { bankAccountId?: string | null; gcs?: { pdfPath?: string | null } };
}): Promise<ResolveStatementEntryForCheckResult> => {
  const byCheckId = await StatementTransactionModel.findOne({
    companyId: args.companyId,
    statementId: args.statementId,
    statementCheckId: args.checkId
  });
  if (byCheckId) {
    return { ok: true, entry: byCheckId, linked: 'existing' };
  }

  const check = await StatementCheckModel.findOne({
    _id: args.checkId,
    companyId: args.companyId,
    statementId: args.statementId
  });
  if (!check) {
    return { ok: false, error: 'Check not found', status: 404 };
  }

  const statementPdfPath = args.statement?.gcs?.pdfPath ?? undefined;
  const checkFrontPath = check.gcs?.frontPath ?? undefined;
  const statementBankAccountId = String(args.statement?.bankAccountId ?? '').trim() || undefined;

  const matchedTxnId = String(check.match?.statementTransactionId ?? '').trim();
  if (matchedTxnId) {
    const byMatch = await StatementTransactionModel.findOne({
      _id: matchedTxnId,
      companyId: args.companyId,
      statementId: args.statementId
    });
    if (byMatch) {
      await backfillCheckTransactionLink({
        companyId: args.companyId,
        statementId: args.statementId,
        check,
        entry: byMatch,
        statementPdfPath,
        checkFrontPath
      });
      return { ok: true, entry: byMatch, linked: 'matched' };
    }
  }

  const fields = readCheckFields(check);
  const byClearedRow = await findClearedCheckTransaction({
    companyId: args.companyId,
    statementId: args.statementId,
    checkNumber: fields.checkNumber || undefined,
    amount: fields.amount,
    postDate: fields.postDate || undefined
  });
  if (byClearedRow) {
    await backfillCheckTransactionLink({
      companyId: args.companyId,
      statementId: args.statementId,
      check,
      entry: byClearedRow,
      statementPdfPath,
      checkFrontPath
    });
    return { ok: true, entry: byClearedRow, linked: 'matched' };
  }

  const created = await createStatementEntryFromCheck({
    companyId: args.companyId,
    statementId: args.statementId,
    checkId: args.checkId,
    check,
    statementBankAccountId,
    statementPdfPath
  });

  await StatementCheckModel.updateOne(
    { _id: check._id, companyId: args.companyId, statementId: args.statementId },
    {
      $set: {
        match: {
          ...(check.match ?? {}),
          statementTransactionId: created._id.toString(),
          matchConfidence: 0.75,
          reasons: [
            ...(Array.isArray(check.match?.reasons) ? check.match.reasons : []),
            'Statement transaction created from check review'
          ]
        }
      }
    }
  );

  return { ok: true, entry: created, linked: 'created' };
};
