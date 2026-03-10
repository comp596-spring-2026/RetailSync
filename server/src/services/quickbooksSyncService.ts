import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { QuickBooksReferenceModel } from '../models/QuickBooksReference';
import { StatementTransactionModel } from '../models/StatementTransaction';
import { ensureDefaultChartOfAccounts } from './ledgerService';
import {
  QuickBooksAccountRecord,
  createQuickBooksCheckTransaction,
  createQuickBooksDepositTransaction,
  createQuickBooksExpenseTransaction,
  createQuickBooksJournalEntry,
  createQuickBooksTransferTransaction,
  listQuickBooksAccounts,
  listQuickBooksEntities
} from './quickbooksService';

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
  type ApprovedEntry = {
    _id: string;
    date: string;
    description: string;
    amount: number;
    type: 'debit' | 'credit';
    statementTransactionId: string;
    fallbackJournalLines?: Array<{ accountCode: string; debit: number; credit: number; description?: string }>;
    proposal?: {
      qbTxnType?: 'Expense' | 'Deposit' | 'Transfer' | 'Check';
      bankAccountId?: string;
      categoryAccountId?: string;
      payeeType?: 'vendor' | 'customer' | 'employee' | 'other';
      payeeId?: string;
      payeeName?: string;
      transferTargetAccountId?: string;
      memo?: string;
    };
  };

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
    .lean<ApprovedEntry[]>();

  let posted = 0;
  let failed = 0;

  for (const entry of entries) {
    const proposal = entry.proposal;
    if (!proposal?.qbTxnType) {
      failed += 1;
      await setPostingFailure(entry._id, companyId, 'Missing proposal.qbTxnType');
      await syncStatementTransactionPosting(
        companyId,
        entry.statementTransactionId,
        'failed',
        undefined,
        'Missing proposal.qbTxnType'
      );
      continue;
    }

    try {
      let qbTxnId: string | undefined;

      if (proposal.qbTxnType === 'Expense') {
        if (!proposal.bankAccountId || !proposal.categoryAccountId) {
          throw new Error('Expense requires bankAccountId and categoryAccountId');
        }
        const result = await createQuickBooksExpenseTransaction({
          companyId,
          txnDate: entry.date,
          amount: Math.abs(entry.amount),
          bankAccountId: proposal.bankAccountId,
          categoryAccountId: proposal.categoryAccountId,
          payeeRefId: proposal.payeeId,
          memo: proposal.memo ?? entry.description
        });
        qbTxnId = result.txnId;
      } else if (proposal.qbTxnType === 'Deposit') {
        if (!proposal.bankAccountId || !proposal.categoryAccountId) {
          throw new Error('Deposit requires bankAccountId and categoryAccountId');
        }
        const result = await createQuickBooksDepositTransaction({
          companyId,
          txnDate: entry.date,
          amount: Math.abs(entry.amount),
          bankAccountId: proposal.bankAccountId,
          categoryAccountId: proposal.categoryAccountId,
          memo: proposal.memo ?? entry.description
        });
        qbTxnId = result.txnId;
      } else if (proposal.qbTxnType === 'Transfer') {
        if (!proposal.bankAccountId || !proposal.transferTargetAccountId) {
          throw new Error('Transfer requires bankAccountId and transferTargetAccountId');
        }
        const result = await createQuickBooksTransferTransaction({
          companyId,
          txnDate: entry.date,
          amount: Math.abs(entry.amount),
          fromAccountId: proposal.bankAccountId,
          toAccountId: proposal.transferTargetAccountId,
          memo: proposal.memo ?? entry.description
        });
        qbTxnId = result.txnId;
      } else if (proposal.qbTxnType === 'Check') {
        if (!proposal.bankAccountId || !proposal.categoryAccountId) {
          throw new Error('Check requires bankAccountId and categoryAccountId');
        }
        const result = await createQuickBooksCheckTransaction({
          companyId,
          txnDate: entry.date,
          amount: Math.abs(entry.amount),
          bankAccountId: proposal.bankAccountId,
          categoryAccountId: proposal.categoryAccountId,
          payeeRefId: proposal.payeeId,
          memo: proposal.memo ?? entry.description
        });
        qbTxnId = result.txnId;
      }

      if (!qbTxnId) {
        throw new Error('Typed posting did not return txn id');
      }

      posted += 1;
      await LedgerEntryModel.updateOne(
        { _id: entry._id, companyId },
        {
          $set: {
            'posting.status': 'posted',
            'posting.qbTxnId': qbTxnId,
            'posting.error': null,
            'posting.postedAt': new Date()
          },
          $inc: {
            'posting.attempts': 1
          }
        }
      );

      await syncStatementTransactionPosting(
        companyId,
        entry.statementTransactionId,
        'posted',
        qbTxnId,
        undefined
      );
    } catch (typedError) {
      const fallbackLines =
        (entry.fallbackJournalLines && entry.fallbackJournalLines.length > 0
          ? entry.fallbackJournalLines
          : makeFallbackLines(entry)) ?? [];

      try {
        const result = await createQuickBooksJournalEntry({
          companyId,
          txnDate: entry.date,
          privateNote: `${entry.description} (fallback journal)`,
          lines: fallbackLines
            .map((line) => {
              const accountId = String(line.accountCode || '').trim();
              if (!accountId) return null;
              if (Number(line.debit || 0) > 0) {
                return {
                  accountId,
                  amount: Math.abs(Number(line.debit)),
                  postingType: 'Debit' as const,
                  description: line.description
                };
              }
              if (Number(line.credit || 0) > 0) {
                return {
                  accountId,
                  amount: Math.abs(Number(line.credit)),
                  postingType: 'Credit' as const,
                  description: line.description
                };
              }
              return null;
            })
            .filter((line): line is NonNullable<typeof line> => Boolean(line))
        });

        posted += 1;
        await LedgerEntryModel.updateOne(
          { _id: entry._id, companyId },
          {
            $set: {
              'posting.status': 'posted',
              'posting.qbTxnId': result.journalEntryId,
              'posting.error': `Typed failed, fallback journal posted: ${String((typedError as Error).message)}`,
              'posting.postedAt': new Date()
            },
            $inc: {
              'posting.attempts': 1
            }
          }
        );

        await syncStatementTransactionPosting(
          companyId,
          entry.statementTransactionId,
          'posted',
          result.journalEntryId,
          undefined
        );
      } catch (fallbackError) {
        failed += 1;
        const errorMessage = `Typed failed: ${String((typedError as Error).message)} | fallback failed: ${String((fallbackError as Error).message)}`;
        await setPostingFailure(entry._id, companyId, errorMessage);
        await syncStatementTransactionPosting(
          companyId,
          entry.statementTransactionId,
          'failed',
          undefined,
          errorMessage
        );
      }
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
