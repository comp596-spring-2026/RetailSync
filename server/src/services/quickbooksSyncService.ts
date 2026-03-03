import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { ensureDefaultChartOfAccounts } from './ledgerService';
import {
  QuickBooksAccountRecord,
  QuickBooksJournalLineInput,
  createQuickBooksJournalEntry,
  listQuickBooksAccounts
} from './quickbooksService';

type SyncStatus = 'idle' | 'running' | 'success' | 'error';

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
  jobType: 'qb_pull_accounts' | 'qb_push_entries'
) => {
  if (jobType === 'qb_pull_accounts') {
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
  jobType: 'qb_pull_accounts' | 'qb_push_entries',
  error: string
) => {
  const now = new Date();
  if (jobType === 'qb_pull_accounts') {
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

export const syncQuickBooksAccountsToChartOfAccounts = async (companyId: string) => {
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

  const now = new Date();
  await updateQuickBooksSyncFields(companyId, {
    'quickbooks.lastPullStatus': 'success' as SyncStatus,
    'quickbooks.lastPullAt': now,
    'quickbooks.lastPullCount': activeAccounts.length,
    'quickbooks.lastPullError': null
  });

  return {
    pulled: activeAccounts.length
  };
};

const buildJournalLines = ({
  accountIdByCode,
  entry
}: {
  accountIdByCode: Map<string, string>;
  entry: {
    _id: string;
    lines: Array<{ accountCode: string; debit: number; credit: number; category?: string }>;
  };
}) => {
  const lines: QuickBooksJournalLineInput[] = [];
  for (const line of entry.lines) {
    const accountId = accountIdByCode.get(String(line.accountCode));
    if (!accountId) {
      throw new Error(`No QuickBooks account mapping for account code ${line.accountCode}`);
    }
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    if (debit > 0) {
      lines.push({
        accountId,
        amount: Math.abs(debit),
        postingType: 'Debit',
        description: line.category
      });
    }
    if (credit > 0) {
      lines.push({
        accountId,
        amount: Math.abs(credit),
        postingType: 'Credit',
        description: line.category
      });
    }
  }
  if (!lines.length) {
    throw new Error(`Ledger entry ${entry._id} has no debit/credit lines to sync`);
  }
  return lines;
};

export const pushPostedLedgerEntriesToQuickBooks = async (
  companyId: string,
  limit = 200
) => {
  type PostedEntry = {
    _id: string;
    date: string;
    memo?: string;
    lines: Array<{ accountCode: string; debit: number; credit: number; category?: string }>;
  };
  const mappedAccounts = await ChartOfAccountModel.find({
    companyId,
    qbAccountId: { $type: 'string', $ne: '' }
  }).select('code qbAccountId');

  const accountIdByCode = new Map<string, string>();
  for (const account of mappedAccounts) {
    if (account.code && account.qbAccountId) {
      accountIdByCode.set(String(account.code), String(account.qbAccountId));
    }
  }
  if (!accountIdByCode.size) {
    throw new Error('No QuickBooks account mappings found. Pull Chart of Accounts first.');
  }

  const entries = await LedgerEntryModel.find({
    companyId,
    status: 'posted',
    $or: [{ qbTxnId: null }, { qbTxnId: { $exists: false } }]
  })
    .select('_id date memo lines')
    .sort({ postedAt: 1, createdAt: 1 })
    .limit(limit)
    .lean<PostedEntry[]>();

  let synced = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      const lines = buildJournalLines({ accountIdByCode, entry });
      const result = await createQuickBooksJournalEntry({
        companyId,
        txnDate: String(entry.date),
        privateNote: entry.memo ?? '',
        lines
      });
      await LedgerEntryModel.updateOne(
        { _id: entry._id, companyId },
        {
          $set: {
            qbTxnId: result.journalEntryId,
            qbSyncedAt: new Date(),
            qbSyncError: null
          }
        }
      );
      synced += 1;
    } catch (error) {
      failed += 1;
      await LedgerEntryModel.updateOne(
        { _id: entry._id, companyId },
        {
          $set: {
            qbSyncError: String((error as Error).message)
          }
        }
      );
    }
  }

  const now = new Date();
  await updateQuickBooksSyncFields(companyId, {
    'quickbooks.lastPushStatus': failed > 0 ? ('error' as SyncStatus) : ('success' as SyncStatus),
    'quickbooks.lastPushAt': now,
    'quickbooks.lastPushCount': synced,
    'quickbooks.lastPushError': failed > 0 ? `${failed} entries failed to sync` : null
  });

  return {
    scanned: entries.length,
    synced,
    failed
  };
};
