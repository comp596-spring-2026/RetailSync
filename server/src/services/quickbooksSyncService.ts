import mongoose from 'mongoose';
import { BankStatement } from '../models/BankStatement';
import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { QuickBooksReferenceModel } from '../models/QuickBooksReference';
import { StatementTransactionModel } from '../models/StatementTransaction';
import {
  resolveChartAccountQbId,
  resolveDefaultDepositLineQbId,
  resolveDefaultExpenseCategoryQbId
} from './chartAccountPostingResolve';
import { ensureDefaultChartOfAccounts } from './ledgerService';
import { buildStatementPostingPreviewLines } from '@retailsync/shared';
import {
  QuickBooksAccountRecord,
  createQuickBooksCheckTransaction,
  createQuickBooksDepositTransaction,
  createQuickBooksExpenseTransaction,
  createQuickBooksJournalEntry,
  createQuickBooksPaymentTransaction,
  createQuickBooksSalesReceiptTransaction,
  createQuickBooksTransferTransaction,
  findDefaultQuickBooksServiceItem,
  findMatchingQuickBooksCheckPurchase,
  listQuickBooksAccounts,
  listQuickBooksEntities
} from '../integrations/quickbooks';

export type LedgerProposalForPosting = {
  qbTxnType?: 'Expense' | 'Deposit' | 'Transfer' | 'Check' | 'SalesReceipt' | 'Payment';
  bankAccountId?: string;
  categoryAccountId?: string;
  payeeType?: 'vendor' | 'customer' | 'employee' | 'other';
  payeeId?: string;
  payeeName?: string;
  transferTargetAccountId?: string;
  memo?: string;
  checkNumber?: string;
  matchExistingCheck?: boolean;
  salesItemRefId?: string;
  linkedInvoiceTxnId?: string;
};

export type LedgerEntryForPosting = {
  _id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  statementTransactionId: string;
  fallbackJournalLines?: Array<{ accountCode: string; debit: number; credit: number; description?: string }>;
  proposal?: LedgerProposalForPosting;
};

export type PostLedgerEntryResult =
  | {
      ok: true;
      qbTxnId: string;
      qbTxnType: NonNullable<LedgerProposalForPosting['qbTxnType']>;
      matchedExisting?: boolean;
      registerSummary: string;
      previewLines: string[];
    }
  | { ok: false; error: string };

type SyncStatus = 'idle' | 'running' | 'success' | 'error';
type SyncJobType = 'quickbooks.refresh_reference_data' | 'quickbooks.post_approved';

const normalizeAccountCode = (input: string | null, accountId: string) => {
  const cleaned = (input ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) return `QB-${accountId}`;
  return cleaned.slice(0, 60);
};

const ensureUniqueCode = (
  usedCodes: Set<string>,
  preferred: string,
  accountId: string
) => {
  let next = preferred;
  if (!usedCodes.has(next)) {
    usedCodes.add(next);
    return next;
  }
  next = `QB-${accountId}`;
  if (!usedCodes.has(next)) {
    usedCodes.add(next);
    return next;
  }
  let suffix = 1;
  while (usedCodes.has(`${next}-${suffix}`)) {
    suffix += 1;
  }
  const resolved = `${next}-${suffix}`;
  usedCodes.add(resolved);
  return resolved;
};

const mapQuickBooksAccountType = (
  accountType: string | null
): 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' => {
  const normalized = (accountType ?? '').trim().toLowerCase();
  if (normalized.includes('asset') || normalized === 'bank') return 'asset';
  if (normalized.includes('liability') || normalized === 'credit card') return 'liability';
  if (normalized.includes('equity')) return 'equity';
  if (normalized.includes('income') || normalized.includes('revenue')) return 'revenue';
  if (normalized.includes('expense') || normalized.includes('cost of goods sold')) return 'expense';
  return 'expense';
};

const updateQuickBooksSyncFields = async (
  companyId: string,
  patch: Record<string, unknown>
) => {
  await IntegrationSettingsModel.findOneAndUpdate(
    { companyId },
    {
      $set: {
        ...patch,
        'quickbooks.updatedAt': new Date()
      }
    },
    { new: false }
  );
};

export const markQuickBooksSyncRunning = async (
  companyId: string,
  jobType: SyncJobType
) => {
  if (jobType === 'quickbooks.refresh_reference_data') {
    await updateQuickBooksSyncFields(companyId, {
      'quickbooks.lastPullStatus': 'running' as SyncStatus,
      'quickbooks.lastPullError': null
    });
  } else {
    await updateQuickBooksSyncFields(companyId, {
      'quickbooks.lastPushStatus': 'running' as SyncStatus,
      'quickbooks.lastPushError': null
    });
  }
};

export const markQuickBooksSyncFailure = async (
  companyId: string,
  jobType: SyncJobType,
  error: string
) => {
  const now = new Date();
  if (jobType === 'quickbooks.refresh_reference_data') {
    await updateQuickBooksSyncFields(companyId, {
      'quickbooks.lastPullStatus': 'error' as SyncStatus,
      'quickbooks.lastPullAt': now,
      'quickbooks.lastPullError': error
    });
  } else {
    await updateQuickBooksSyncFields(companyId, {
      'quickbooks.lastPushStatus': 'error' as SyncStatus,
      'quickbooks.lastPushAt': now,
      'quickbooks.lastPushError': error
    });
  }
};

const upsertQuickBooksEntities = async (companyId: string) => {
  const [vendors, customers, employees] = await Promise.all([
    listQuickBooksEntities(companyId, 'vendor'),
    listQuickBooksEntities(companyId, 'customer'),
    listQuickBooksEntities(companyId, 'employee')
  ]);

  const all = [
    ...vendors.map((row) => ({ ...row, entityType: 'vendor' as const })),
    ...customers.map((row) => ({ ...row, entityType: 'customer' as const })),
    ...employees.map((row) => ({ ...row, entityType: 'employee' as const }))
  ];

  if (all.length === 0) {
    return { vendors: 0, customers: 0, employees: 0 };
  }

  const ops = all.map((entity) => ({
    updateOne: {
      filter: { companyId, entityType: entity.entityType, qbId: entity.id },
      update: {
        $set: {
          companyId,
          entityType: entity.entityType,
          qbId: entity.id,
          displayName: entity.displayName,
          active: entity.active,
          raw: entity.raw
        }
      },
      upsert: true
    }
  }));

  await QuickBooksReferenceModel.bulkWrite(ops as any, { ordered: false });

  return {
    vendors: vendors.length,
    customers: customers.length,
    employees: employees.length
  };
};

export const syncQuickBooksReferenceData = async (companyId: string) => {
  await ensureDefaultChartOfAccounts(companyId);
  const accounts = await listQuickBooksAccounts(companyId);
  const activeAccounts = accounts.filter((account) => account.active);
  const existing = await ChartOfAccountModel.find({ companyId }).select(
    '_id code qbAccountId'
  );

  const existingByQbId = new Map<string, { code: string }>();
  const usedCodes = new Set<string>();
  for (const row of existing) {
    if (row.code) usedCodes.add(String(row.code));
    if (row.qbAccountId) {
      existingByQbId.set(String(row.qbAccountId), {
        code: String(row.code)
      });
    }
  }

  const ops = activeAccounts.map((account: QuickBooksAccountRecord) => {
    const matched = existingByQbId.get(account.id);
    const preferredCode = normalizeAccountCode(account.code, account.id);
    const nextCode = matched
      ? matched.code
      : ensureUniqueCode(usedCodes, preferredCode, account.id);
    const type = mapQuickBooksAccountType(account.accountType);
    return {
      updateOne: {
        filter: { companyId, qbAccountId: account.id },
        update: {
          $set: {
            companyId,
            code: nextCode,
            name: account.name,
            type,
            qbAccountId: account.id,
            isSystem: false
          }
        },
        upsert: true
      }
    };
  });

  if (ops.length > 0) {
    await ChartOfAccountModel.bulkWrite(ops as any, { ordered: false });
  }

  const entityCounts = await upsertQuickBooksEntities(companyId);

  const now = new Date();
  await updateQuickBooksSyncFields(companyId, {
    'quickbooks.lastPullStatus': 'success' as SyncStatus,
    'quickbooks.lastPullAt': now,
    'quickbooks.lastPullCount':
      activeAccounts.length + entityCounts.vendors + entityCounts.customers + entityCounts.employees,
    'quickbooks.lastPullError': null
  });

  return {
    pulledAccounts: activeAccounts.length,
    pulledVendors: entityCounts.vendors,
    pulledCustomers: entityCounts.customers,
    pulledEmployees: entityCounts.employees
  };
};

const makeFallbackLines = (entry: {
  amount: number;
  proposal?: { categoryAccountId?: string };
  type: 'debit' | 'credit';
}) => {
  const categoryCode = entry.proposal?.categoryAccountId ?? '6999';
  const amount = Math.abs(Number(entry.amount || 0));
  if (!amount) return [];

  if (entry.type === 'debit') {
    return [
      { accountCode: categoryCode, debit: amount, credit: 0, description: 'Fallback expense' },
      { accountCode: '1000', debit: 0, credit: amount, description: 'Fallback cash/bank offset' }
    ];
  }

  return [
    { accountCode: '1000', debit: amount, credit: 0, description: 'Fallback cash/bank offset' },
    { accountCode: categoryCode, debit: 0, credit: amount, description: 'Fallback income' }
  ];
};

const setPostingFailure = async (entryId: string, companyId: string, error: string) => {
  await LedgerEntryModel.updateOne(
    { _id: entryId, companyId },
    {
      $set: {
        'posting.status': 'failed',
        'posting.error': error
      },
      $inc: {
        'posting.attempts': 1
      }
    }
  );
};

const resolvePostingAccountRef = (companyId: string, ref?: string | null) =>
  resolveChartAccountQbId(companyId, ref);

const resolvePostingAccountLabel = async (companyId: string, ref?: string | null): Promise<string | undefined> => {
  const trimmed = String(ref ?? '').trim();
  if (!trimmed) return undefined;
  if (mongoose.isValidObjectId(trimmed)) {
    const doc = await ChartOfAccountModel.findOne({
      companyId,
      _id: new mongoose.Types.ObjectId(trimmed)
    })
      .select('name qbAccountId')
      .lean();
    if (doc?.name) return String(doc.name);
  }
  return trimmed;
};

const resolvePayeeRefId = async (
  companyId: string,
  proposal: LedgerProposalForPosting,
  direction: 'debit' | 'credit'
): Promise<string | undefined> => {
  const direct = String(proposal.payeeId ?? '').trim();
  if (direct && !mongoose.isValidObjectId(direct)) {
    return direct;
  }
  if (direct && mongoose.isValidObjectId(direct)) {
    const entity = await QuickBooksReferenceModel.findOne({
      companyId,
      _id: new mongoose.Types.ObjectId(direct)
    })
      .select('qbId')
      .lean();
    if (entity?.qbId) return String(entity.qbId);
  }
  const payeeName = String(proposal.payeeName ?? '').trim();
  if (!payeeName) return undefined;
  const entityTypes =
    proposal.payeeType === 'vendor'
      ? ['vendor']
      : proposal.payeeType === 'customer'
        ? ['customer']
        : direction === 'debit'
          ? ['vendor']
          : ['customer'];
  const entity = await QuickBooksReferenceModel.findOne({
    companyId,
    entityType: { $in: entityTypes },
    active: true,
    displayName: new RegExp(`^${payeeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  })
    .select('qbId')
    .lean();
  return entity?.qbId ? String(entity.qbId) : undefined;
};

const enrichProposalForPosting = async (
  companyId: string,
  proposal: LedgerProposalForPosting,
  statementTransactionId: string
): Promise<LedgerProposalForPosting> => {
  const enriched = { ...proposal };
  if (!String(enriched.bankAccountId ?? '').trim()) {
    const txn = await StatementTransactionModel.findOne({
      _id: statementTransactionId,
      companyId
    })
      .select('statementId')
      .lean();
    if (txn?.statementId) {
      const statement = await BankStatement.findOne({
        _id: txn.statementId,
        companyId
      })
        .select('bankAccountId')
        .lean();
      const statementBank = String(statement?.bankAccountId ?? '').trim();
      if (statementBank) {
        enriched.bankAccountId = statementBank;
      }
    }
  }
  if (!String(enriched.categoryAccountId ?? '').trim()) {
    if (enriched.qbTxnType === 'Expense' || enriched.qbTxnType === 'Check') {
      const qb = await resolveDefaultExpenseCategoryQbId(companyId);
      if (qb) enriched.categoryAccountId = qb;
    } else if (enriched.qbTxnType === 'Deposit') {
      const qb = await resolveDefaultDepositLineQbId(companyId);
      if (qb) enriched.categoryAccountId = qb;
    }
  }
  return enriched;
};

export const postLedgerEntryToQuickBooks = async (
  companyId: string,
  entry: LedgerEntryForPosting
): Promise<PostLedgerEntryResult> => {
  const baseProposal = entry.proposal;
  if (!baseProposal?.qbTxnType) {
    return { ok: false, error: 'Missing proposal.qbTxnType' };
  }

  const proposal = await enrichProposalForPosting(
    companyId,
    baseProposal,
    entry.statementTransactionId
  );

  const resolvedBank = await resolvePostingAccountRef(companyId, proposal.bankAccountId);
  const resolvedCategory = await resolvePostingAccountRef(companyId, proposal.categoryAccountId);
  const resolvedTransferTarget = await resolvePostingAccountRef(companyId, proposal.transferTargetAccountId);
  const bankLabel = (await resolvePostingAccountLabel(companyId, proposal.bankAccountId)) ?? 'Bank account';
  const lineLabel =
    (await resolvePostingAccountLabel(companyId, proposal.categoryAccountId)) ?? 'Line account';
  const transferToLabel =
    (await resolvePostingAccountLabel(companyId, proposal.transferTargetAccountId)) ??
    'Other bank account';

  try {
    let qbTxnId: string | undefined;
    let matchedExisting = false;

    if (proposal.qbTxnType === 'Expense') {
      if (!resolvedBank || !resolvedCategory) {
        throw new Error('Expense requires bankAccountId and categoryAccountId');
      }
      if (resolvedBank === resolvedCategory) {
        throw new Error('Expense bank and category accounts must differ');
      }
      const payeeRefId = await resolvePayeeRefId(companyId, proposal, entry.type);
      const result = await createQuickBooksExpenseTransaction({
        companyId,
        txnDate: entry.date,
        amount: Math.abs(entry.amount),
        bankAccountId: resolvedBank,
        categoryAccountId: resolvedCategory,
        payeeRefId,
        memo: proposal.memo ?? entry.description
      });
      qbTxnId = result.txnId;
    } else if (proposal.qbTxnType === 'Deposit') {
      if (!resolvedBank || !resolvedCategory) {
        if (!resolvedBank && !resolvedCategory) {
          throw new Error('Deposit requires bankAccountId and categoryAccountId');
        }
        if (!resolvedBank) {
          throw new Error('Deposit requires bankAccountId (deposit-to bank account)');
        }
        throw new Error('Deposit requires categoryAccountId (deposit line / income account)');
      }
      if (resolvedBank === resolvedCategory) {
        throw new Error('Deposit bank and line accounts must differ');
      }
      const result = await createQuickBooksDepositTransaction({
        companyId,
        txnDate: entry.date,
        amount: Math.abs(entry.amount),
        bankAccountId: resolvedBank,
        categoryAccountId: resolvedCategory,
        memo: proposal.memo ?? entry.description
      });
      qbTxnId = result.txnId;
    } else if (proposal.qbTxnType === 'SalesReceipt') {
      if (!resolvedBank) {
        throw new Error('Sales receipt requires deposit bank account');
      }
      const customerRefId = await resolvePayeeRefId(companyId, { ...proposal, payeeType: 'customer' }, 'credit');
      if (!customerRefId) {
        throw new Error('Sales receipt requires a QuickBooks customer');
      }
      const itemRefId =
        String(proposal.salesItemRefId ?? '').trim() ||
        (await findDefaultQuickBooksServiceItem(companyId));
      if (!itemRefId) {
        throw new Error('Sales receipt requires a QuickBooks service item');
      }
      const receiptAmount = Math.abs(entry.amount);
      const result = await createQuickBooksSalesReceiptTransaction({
        companyId,
        txnDate: entry.date,
        customerRefId,
        depositToAccountId: resolvedBank,
        memo: proposal.memo ?? entry.description,
        lines: [
          {
            amount: receiptAmount,
            itemRefId,
            quantity: 1,
            unitPrice: receiptAmount
          }
        ]
      });
      qbTxnId = result.txnId;
    } else if (proposal.qbTxnType === 'Payment') {
      if (!resolvedBank) {
        throw new Error('Payment requires deposit bank account');
      }
      const customerRefId = await resolvePayeeRefId(companyId, { ...proposal, payeeType: 'customer' }, 'credit');
      if (!customerRefId) {
        throw new Error('Payment requires a QuickBooks customer');
      }
      const linkedInvoiceTxnId = String(proposal.linkedInvoiceTxnId ?? '').trim();
      const result = await createQuickBooksPaymentTransaction({
        companyId,
        txnDate: entry.date,
        amount: Math.abs(entry.amount),
        customerRefId,
        depositToAccountId: resolvedBank,
        memo: proposal.memo ?? entry.description,
        linkedTxns: linkedInvoiceTxnId
          ? [{ txnId: linkedInvoiceTxnId, txnType: 'Invoice' as const, amount: Math.abs(entry.amount) }]
          : undefined
      });
      qbTxnId = result.txnId;
    } else if (proposal.qbTxnType === 'Transfer') {
      if (!resolvedBank || !resolvedTransferTarget) {
        throw new Error('Transfer requires bankAccountId and transferTargetAccountId');
      }
      if (resolvedBank === resolvedTransferTarget) {
        throw new Error('Transfer from and to accounts must differ');
      }
      const result = await createQuickBooksTransferTransaction({
        companyId,
        txnDate: entry.date,
        amount: Math.abs(entry.amount),
        fromAccountId: resolvedBank,
        toAccountId: resolvedTransferTarget,
        memo: proposal.memo ?? entry.description
      });
      qbTxnId = result.txnId;
    } else if (proposal.qbTxnType === 'Check') {
      if (!resolvedBank || !resolvedCategory) {
        throw new Error('Check requires bankAccountId and categoryAccountId');
      }
      if (resolvedBank === resolvedCategory) {
        throw new Error('Check bank and category accounts must differ');
      }
      const checkNumber = String(proposal.checkNumber ?? '').trim();
      const shouldMatch = proposal.matchExistingCheck !== false;
      if (shouldMatch && checkNumber) {
        const existing = await findMatchingQuickBooksCheckPurchase({
          companyId,
          bankAccountId: resolvedBank,
          checkNumber,
          amount: Math.abs(entry.amount)
        });
        if (existing?.txnId) {
          qbTxnId = existing.txnId;
          matchedExisting = true;
        }
      }
      if (!qbTxnId) {
        const payeeRefId = await resolvePayeeRefId(companyId, proposal, entry.type);
        const result = await createQuickBooksCheckTransaction({
          companyId,
          txnDate: entry.date,
          amount: Math.abs(entry.amount),
          bankAccountId: resolvedBank,
          categoryAccountId: resolvedCategory,
          payeeRefId,
          memo: proposal.memo ?? entry.description,
          docNumber: checkNumber || undefined
        });
        qbTxnId = result.txnId;
      }
    }

    if (!qbTxnId) {
      throw new Error('Typed posting did not return txn id');
    }

    const finalPreview = buildStatementPostingPreviewLines({
      qbTxnType: proposal.qbTxnType,
      amount: entry.amount,
      direction: entry.type,
      bankAccountLabel: bankLabel,
      lineAccountLabel: lineLabel,
      transferToAccountLabel: transferToLabel,
      payeeName: proposal.payeeName,
      checkNumber: proposal.checkNumber,
      matchedExisting
    });

    await LedgerEntryModel.updateOne(
      { _id: entry._id, companyId },
      {
        $set: {
          'posting.status': 'posted',
          'posting.qbTxnId': qbTxnId,
          'posting.error': null,
          'posting.postedAt': new Date()
        },
        $inc: { 'posting.attempts': 1 }
      }
    );
    await syncStatementTransactionPosting(companyId, entry.statementTransactionId, 'posted', qbTxnId, undefined);

    const registerSummary = finalPreview[0] ?? `Posted to QuickBooks (${proposal.qbTxnType}).`;
    return {
      ok: true,
      qbTxnId,
      qbTxnType: proposal.qbTxnType,
      matchedExisting,
      registerSummary,
      previewLines: finalPreview
    };
  } catch (typedError) {
    const errorMessage = String((typedError as Error).message);
    await setPostingFailure(entry._id, companyId, errorMessage);
    await syncStatementTransactionPosting(
      companyId,
      entry.statementTransactionId,
      'failed',
      undefined,
      errorMessage
    );
    return { ok: false, error: errorMessage };
  }
};

export const postApprovedLedgerEntryByStatementTransactionId = async (
  companyId: string,
  statementTransactionId: string
): Promise<PostLedgerEntryResult> => {
  const entry = await LedgerEntryModel.findOne({
    companyId,
    statementTransactionId,
    reviewStatus: 'approved'
  })
    .select('_id date description amount type statementTransactionId proposal fallbackJournalLines posting')
    .lean<LedgerEntryForPosting & { posting?: { status?: string; qbTxnId?: string | null } }>();

  if (!entry) {
    return { ok: false, error: 'Approved ledger entry not found for this statement row' };
  }
  if (entry.posting?.status === 'posted' && entry.posting?.qbTxnId) {
    const qbTxnType = entry.proposal?.qbTxnType ?? 'Deposit';
    const previewLines = buildStatementPostingPreviewLines({
      qbTxnType,
      amount: entry.amount,
      direction: entry.type,
      payeeName: entry.proposal?.payeeName,
      checkNumber: entry.proposal?.checkNumber
    });
    return {
      ok: true,
      qbTxnId: String(entry.posting.qbTxnId),
      qbTxnType,
      registerSummary: 'Already posted to QuickBooks.',
      previewLines
    };
  }

  return postLedgerEntryToQuickBooks(companyId, entry);
};

const syncStatementTransactionPosting = async (
  companyId: string,
  statementTransactionId: string,
  status: 'posted' | 'failed',
  qbTxnId?: string,
  error?: string
) => {
  await StatementTransactionModel.updateOne(
    { _id: statementTransactionId, companyId },
    {
      $set: {
        'posting.status': status,
        'posting.qbTxnId': qbTxnId ?? null,
        'posting.error': error ?? null
      }
    }
  );
};

export const postApprovedLedgerEntriesToQuickBooks = async (
  companyId: string,
  limit = 200
) => {
  const entries = await LedgerEntryModel.find({
    companyId,
    reviewStatus: 'approved',
    'posting.status': { $in: ['not_posted', 'failed'] },
    $or: [
      { 'posting.qbTxnId': null },
      { 'posting.qbTxnId': { $exists: false } },
      { 'posting.qbTxnId': '' }
    ]
  })
    .select('_id date description amount type statementTransactionId proposal fallbackJournalLines')
    .sort({ updatedAt: 1, createdAt: 1 })
    .limit(limit)
    .lean<LedgerEntryForPosting[]>();

  let posted = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await postLedgerEntryToQuickBooks(companyId, entry);
    if (result.ok) {
      posted += 1;
    } else {
      failed += 1;
    }
  }

  const now = new Date();
  await updateQuickBooksSyncFields(companyId, {
    'quickbooks.lastPushStatus': failed > 0 ? ('error' as SyncStatus) : ('success' as SyncStatus),
    'quickbooks.lastPushAt': now,
    'quickbooks.lastPushCount': posted,
    'quickbooks.lastPushError': failed > 0 ? `${failed} entries failed to sync` : null
  });

  return {
    scanned: entries.length,
    posted,
    failed
  };
};
