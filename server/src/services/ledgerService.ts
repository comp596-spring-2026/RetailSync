import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { LedgerEntryModel } from '../models/LedgerEntry';

const DEFAULT_CHART = [
  { code: '1000', name: 'Cash', type: 'asset' as const, isSystem: true },
  { code: '2000', name: 'Accounts Payable', type: 'liability' as const, isSystem: true },
  { code: '4000', name: 'Sales Revenue', type: 'revenue' as const, isSystem: true },
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense' as const, isSystem: true },
  { code: '6999', name: 'Uncategorized Expense', type: 'expense' as const, isSystem: true },
  { code: '7999', name: 'Uncategorized Income', type: 'revenue' as const, isSystem: true }
];

export const ensureDefaultChartOfAccounts = async (companyId: string) => {
  const existing = await ChartOfAccountModel.countDocuments({ companyId });
  if (existing > 0) return;

  await ChartOfAccountModel.insertMany(
    DEFAULT_CHART.map((entry) => ({
      companyId,
      ...entry
    }))
  );
};

type StatementTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
  suggestedCategory?: string;
};

export const createDraftLedgerEntriesFromStatement = async (args: {
  companyId: string;
  statementId: string;
  transactions: StatementTransaction[];
}) => {
  await ensureDefaultChartOfAccounts(args.companyId);

  if (!args.transactions.length) {
    return { created: 0 };
  }

  const ops = args.transactions.map((txn) => {
    const normalizedAmount = Math.abs(Number(txn.amount ?? 0));
    const isDebit = txn.type === 'debit';
    const debitAccount = isDebit ? '6999' : '1000';
    const creditAccount = isDebit ? '1000' : '7999';

    return {
      updateOne: {
        filter: {
          companyId: args.companyId,
          'source.statementId': args.statementId,
          'source.transactionId': txn.id
        },
        update: {
          $setOnInsert: {
            companyId: args.companyId,
            date: txn.date,
            memo: txn.description,
            lines: [
              {
                accountCode: debitAccount,
                debit: normalizedAmount,
                credit: 0,
                category: txn.suggestedCategory ?? ''
              },
              {
                accountCode: creditAccount,
                debit: 0,
                credit: normalizedAmount,
                category: txn.suggestedCategory ?? ''
              }
            ],
            source: {
              statementId: args.statementId,
              transactionId: txn.id
            },
            status: 'draft'
          }
        },
        upsert: true
      }
    };
  });

  const result = await LedgerEntryModel.bulkWrite(ops as any);
  return {
    created: result.upsertedCount ?? 0
  };
};
