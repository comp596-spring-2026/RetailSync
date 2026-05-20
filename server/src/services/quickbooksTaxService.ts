import {
  createQuickBooksAccount,
  createQuickBooksItem,
  listQuickBooksItems,
  createQuickBooksCheckTransaction,
  createQuickBooksJournalEntry,
  ensureFreshQuickBooksSecret,
  listQuickBooksAccounts,
  requestQuickBooksApi,
  runQuickBooksReadQuery
} from '../integrations/quickbooks';
import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { QuickBooksReferenceModel } from '../models/QuickBooksReference';

export type QuickBooksTaxBasis = 'cash' | 'accrual';
export type QuickBooksTaxReportKey =
  | 'profit-loss'
  | 'balance-sheet'
  | 'trial-balance'
  | 'general-ledger'
  | 'ar-aging'
  | 'ap-aging';

export type QuickBooksTaxReportRow = {
  label: string;
  amount: number | null;
  path: string[];
};

export type QuickBooksTaxReport = {
  reportKey: QuickBooksTaxReportKey;
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
  generatedAt: string;
  rows: QuickBooksTaxReportRow[];
  raw: Record<string, unknown>;
};

export type QuickBooksTaxOverview = {
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
  cards: {
    netIncome: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    totalEquity: number | null;
    arOpen: number | null;
    apOpen: number | null;
  };
};

export type QuickBooksTaxChartAccount = {
  id: string;
  name: string;
  code: string | null;
  accountType: string | null;
  active: boolean;
};

export type QuickBooksTaxLedgerEntry = {
  id: string;
  txnDate?: string;
  description: string;
  accountId: string | null;
  accountName: string | null;
  amount: number | null;
  raw?: Record<string, unknown>;
};

export type QuickBooksTaxLedgerResponse = {
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
  accountId: string | null;
  total: number;
  nextCursor: string | null;
  entries: QuickBooksTaxLedgerEntry[];
};

export type QuickBooksTaxPayment = {
  id: string;
  paymentType: 'customer' | 'vendor';
  sourceTxnType: string;
  txnDate: string;
  amount: number;
  entityId: string | null;
  entityName: string | null;
  memo: string | null;
  raw?: Record<string, unknown>;
};

export type QuickBooksTaxPaymentsResponse = {
  from: string;
  to: string;
  type: 'customer' | 'vendor' | 'all';
  nextCursor: string | null;
  payments: QuickBooksTaxPayment[];
};

export type QuickBooksRecoverPaymentInput = {
  clientRequestId: string;
  paymentType: 'customer' | 'vendor';
  txnDate: string;
  amount: number;
  bankAccountId: string;
  customerId?: string;
  vendorId?: string;
  categoryAccountId?: string;
  memo?: string;
};

export type QuickBooksRecoverPaymentResult = {
  created: boolean;
  clientRequestId: string;
  paymentId: string;
  txnType: 'Payment' | 'Purchase';
  txnDate: string;
  amount: number;
};

export type QuickBooksJournalAdjustmentInput = {
  clientRequestId: string;
  txnDate: string;
  memo?: string;
  lines: Array<{
    accountId: string;
    debit?: number;
    credit?: number;
    description?: string;
  }>;
};

export type QuickBooksJournalAdjustmentResult = {
  created: boolean;
  clientRequestId: string;
  journalEntryId: string;
  txnDate: string;
};

export type QuickBooksHubPage = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type QuickBooksHubChartOfAccountsResponse = QuickBooksHubPage & {
  items: Array<{
    id: string;
    qbId: string | null;
    name: string;
    type: string | null;
    detailType: string | null;
    status: 'active' | 'system';
    balance: number | null;
  }>;
};

export type QuickBooksHubEntitiesResponse = QuickBooksHubPage & {
  items: Array<{
    id: string;
    qbId: string;
    entityType: 'customer' | 'vendor';
    displayName: string;
    email: string | null;
    phone: string | null;
    status: 'active' | 'inactive';
    balance: number | null;
  }>;
};

export type QuickBooksHubOperationsResponse = QuickBooksHubPage & {
  items: Array<{
    id: string;
    date: string;
    type: 'Expense' | 'Deposit' | 'Transfer' | 'Check' | 'debit' | 'credit' | null;
    description: string;
    payee: string | null;
    amount: number;
    status: 'not_posted' | 'posting' | 'posted' | 'failed';
    qbId: string | null;
    error: string | null;
  }>;
};

export type QuickBooksAccountRegisterResponse = QuickBooksHubPage & {
  accountId: string;
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
  items: Array<{
    id: string;
    accountId: string;
    date: string | null;
    txnType: string | null;
    qbTxnId: string | null;
    docNum: string | null;
    name: string | null;
    memo: string | null;
    splitAccount: string | null;
    amount: number | null;
    debit: number | null;
    credit: number | null;
    balance: number | null;
  }>;
};

export type QuickBooksLiveTransactionType = 'deposit' | 'check' | 'expense' | 'transfer';

export type QuickBooksLiveTransactionsResponse = QuickBooksHubPage & {
  type: QuickBooksLiveTransactionType;
  items: Array<{
    id: string;
    qbTxnId: string;
    type: QuickBooksLiveTransactionType;
    txnDate: string;
    docNum: string | null;
    payeeName: string | null;
    accountName: string | null;
    amount: number | null;
    memo: string | null;
    status: 'posted' | 'unknown';
  }>;
};

export type QuickBooksTransactionDetail = {
  id: string;
  qbTxnId: string;
  type: QuickBooksLiveTransactionType;
  txnDate: string | null;
  docNum: string | null;
  syncToken: string | null;
  payeeId: string | null;
  payeeName: string | null;
  memo: string | null;
  amount: number | null;
  accountId: string | null;
  accountName: string | null;
  categoryAccountId: string | null;
  categoryAccountName: string | null;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  raw: Record<string, unknown>;
};

const reportKeyToEndpoint: Record<QuickBooksTaxReportKey, string> = {
  'profit-loss': 'ProfitAndLoss',
  'balance-sheet': 'BalanceSheet',
  'trial-balance': 'TrialBalance',
  'general-ledger': 'GeneralLedger',
  'ar-aging': 'ARAgingSummary',
  'ap-aging': 'APAgingSummary'
};

const toAccountingMethod = (basis: QuickBooksTaxBasis) =>
  basis === 'cash' ? 'Cash' : 'Accrual';

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const wrappedNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const normalized = trimmed.replace(/[,$()%]/g, '');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return wrappedNegative ? -parsed : parsed;
};

const toObjectArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object'))
    : [];

const readColData = (value: unknown): Array<Record<string, unknown>> => {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return toObjectArray((value as Record<string, unknown>).ColData);
};

const readLabelFromColData = (colData: Array<Record<string, unknown>>) => {
  for (const col of colData) {
    const value = String(col.value ?? '').trim();
    if (value) return value;
  }
  return '';
};

const readAmountFromColData = (colData: Array<Record<string, unknown>>) => {
  for (let index = colData.length - 1; index >= 0; index -= 1) {
    const parsed = toNumber(colData[index]?.value);
    if (parsed != null) return parsed;
  }
  return null;
};

const flattenReportRows = (
  rows: unknown,
  path: string[] = [],
  output: QuickBooksTaxReportRow[] = []
): QuickBooksTaxReportRow[] => {
  const rowItems = toObjectArray(rows);
  for (const row of rowItems) {
    const colData = readColData(row);
    const label = readLabelFromColData(colData);
    const amount = readAmountFromColData(colData);
    if (label) {
      output.push({
        label,
        amount,
        path
      });
    }

    const headerLabel = readLabelFromColData(readColData(row.Header));
    const nextPath = headerLabel ? [...path, headerLabel] : path;
    const childRows = (row.Rows as Record<string, unknown> | undefined)?.Row;
    if (childRows) {
      flattenReportRows(childRows, nextPath, output);
    }

    const summaryColData = readColData(row.Summary);
    const summaryLabel = readLabelFromColData(summaryColData);
    if (summaryLabel) {
      output.push({
        label: summaryLabel,
        amount: readAmountFromColData(summaryColData),
        path: nextPath
      });
    }
  }
  return output;
};

const findLastAmountByLabel = (
  rows: QuickBooksTaxReportRow[],
  labelFragments: string[]
): number | null => {
  const normalized = labelFragments.map((fragment) => fragment.toLowerCase());
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const label = rows[index]?.label.toLowerCase() ?? '';
    if (normalized.some((fragment) => label.includes(fragment))) {
      return rows[index]?.amount ?? null;
    }
  }
  return null;
};

const qbEscape = (value: string) => value.replace(/'/g, "\\'");

const parseDateFromLabel = (label: string): string | undefined => {
  const match = label.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (!match) return undefined;
  const [month, day, year] = match[1].split('/');
  return `${year}-${month}-${day}`;
};

const idempotencyTag = (clientRequestId: string) => `[retailsync:${clientRequestId}]`;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toPageMeta = (page: number, pageSize: number, total: number): QuickBooksHubPage => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

const isQuickBooksPermissionDeniedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return (
    normalized.startsWith('quickbooks_api_failed:400:') &&
    normalized.includes('permission denied')
  );
};

const fetchOptionalOverviewReport = async (args: {
  companyId: string;
  reportKey: 'ar-aging' | 'ap-aging';
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
}): Promise<QuickBooksTaxReport | null> => {
  try {
    return await fetchQuickBooksTaxReport(args);
  } catch (error) {
    if (isQuickBooksPermissionDeniedError(error)) {
      return null;
    }
    throw error;
  }
};

export const fetchQuickBooksTaxReport = async (args: {
  companyId: string;
  reportKey: QuickBooksTaxReportKey;
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
}): Promise<QuickBooksTaxReport> => {
  const startedAt = Date.now();
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const endpoint = reportKeyToEndpoint[args.reportKey];
  const raw = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/reports/${endpoint}`,
    query: {
      start_date: args.from,
      end_date: args.to,
      accounting_method: toAccountingMethod(args.basis),
      minorversion: 75
    }
  })) as Record<string, unknown>;

  const rows = flattenReportRows(
    (raw.Rows as Record<string, unknown> | undefined)?.Row ?? []
  );

  // eslint-disable-next-line no-console
  console.info('[quickbooks.tax.report.fetch]', {
    companyId: args.companyId,
    reportKey: args.reportKey,
    from: args.from,
    to: args.to,
    basis: args.basis,
    rowCount: rows.length,
    latencyMs: Date.now() - startedAt
  });

  return {
    reportKey: args.reportKey,
    from: args.from,
    to: args.to,
    basis: args.basis,
    generatedAt: new Date().toISOString(),
    rows,
    raw
  };
};

export const fetchQuickBooksTaxOverview = async (args: {
  companyId: string;
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
}): Promise<QuickBooksTaxOverview> => {
  const [profitLoss, balanceSheet, arAging, apAging] = await Promise.all([
    fetchQuickBooksTaxReport({
      companyId: args.companyId,
      reportKey: 'profit-loss',
      from: args.from,
      to: args.to,
      basis: args.basis
    }),
    fetchQuickBooksTaxReport({
      companyId: args.companyId,
      reportKey: 'balance-sheet',
      from: args.from,
      to: args.to,
      basis: args.basis
    }),
    fetchOptionalOverviewReport({
      companyId: args.companyId,
      reportKey: 'ar-aging',
      from: args.from,
      to: args.to,
      basis: args.basis
    }),
    fetchOptionalOverviewReport({
      companyId: args.companyId,
      reportKey: 'ap-aging',
      from: args.from,
      to: args.to,
      basis: args.basis
    })
  ]);

  return {
    from: args.from,
    to: args.to,
    basis: args.basis,
    cards: {
      netIncome: findLastAmountByLabel(profitLoss.rows, ['net income']),
      totalAssets: findLastAmountByLabel(balanceSheet.rows, ['total assets']),
      totalLiabilities: findLastAmountByLabel(balanceSheet.rows, ['total liabilities']),
      totalEquity: findLastAmountByLabel(balanceSheet.rows, ['total equity']),
      arOpen: arAging ? findLastAmountByLabel(arAging.rows, ['total']) : null,
      apOpen: apAging ? findLastAmountByLabel(apAging.rows, ['total']) : null
    }
  };
};

export const listQuickBooksTaxChartOfAccounts = async (
  companyId: string
): Promise<QuickBooksTaxChartAccount[]> => {
  const accounts = await listQuickBooksAccounts(companyId);
  return accounts
    .slice()
    .sort((left, right) => {
      const leftKey = `${left.code ?? ''} ${left.name}`.toLowerCase();
      const rightKey = `${right.code ?? ''} ${right.name}`.toLowerCase();
      return leftKey.localeCompare(rightKey);
    })
    .map((account) => ({
      id: account.id,
      name: account.name,
      code: account.code,
      accountType: account.accountType,
      active: account.active
    }));
};

const readRawString = (
  raw: Record<string, unknown> | null | undefined,
  path: string[]
): string | null => {
  let current: unknown = raw;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (typeof current !== 'string') {
    return null;
  }
  const trimmed = current.trim();
  return trimmed ? trimmed : null;
};

const readRawNumber = (
  raw: Record<string, unknown> | null | undefined,
  paths: string[][]
): number | null => {
  for (const path of paths) {
    let current: unknown = raw;
    let matched = true;
    for (const key of path) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        matched = false;
        break;
      }
      current = (current as Record<string, unknown>)[key];
    }
    if (matched) {
      const parsed = toNumber(current);
      if (parsed != null) {
        return parsed;
      }
    }
  }
  return null;
};

const readNested = (value: unknown, path: string[]): unknown => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const refValue = (value: unknown): string | null =>
  toNullableString(readNested(value, ['value'])) ?? toNullableString(value);

const refName = (value: unknown): string | null =>
  toNullableString(readNested(value, ['name']));

const quickBooksTxnQueryConfig: Record<
  QuickBooksLiveTransactionType,
  {
    queryType: string;
    detailType: string;
    buildWhere: (args: { startDate?: string; endDate?: string }) => string[];
  }
> = {
  deposit: {
    queryType: 'Deposit',
    detailType: 'Deposit',
    buildWhere: ({ startDate, endDate }) => [
      ...(startDate ? [`TxnDate >= '${qbEscape(startDate)}'`] : []),
      ...(endDate ? [`TxnDate <= '${qbEscape(endDate)}'`] : [])
    ]
  },
  transfer: {
    queryType: 'Transfer',
    detailType: 'Transfer',
    buildWhere: ({ startDate, endDate }) => [
      ...(startDate ? [`TxnDate >= '${qbEscape(startDate)}'`] : []),
      ...(endDate ? [`TxnDate <= '${qbEscape(endDate)}'`] : [])
    ]
  },
  check: {
    queryType: 'Purchase',
    detailType: 'Purchase',
    buildWhere: ({ startDate, endDate }) => [
      `PaymentType = 'Check'`,
      ...(startDate ? [`TxnDate >= '${qbEscape(startDate)}'`] : []),
      ...(endDate ? [`TxnDate <= '${qbEscape(endDate)}'`] : [])
    ]
  },
  expense: {
    queryType: 'Purchase',
    detailType: 'Purchase',
    buildWhere: ({ startDate, endDate }) => [
      `PaymentType = 'Cash'`,
      ...(startDate ? [`TxnDate >= '${qbEscape(startDate)}'`] : []),
      ...(endDate ? [`TxnDate <= '${qbEscape(endDate)}'`] : [])
    ]
  }
};

const buildQuickBooksListQuery = (args: {
  type: QuickBooksLiveTransactionType;
  startDate?: string;
  endDate?: string;
  startPosition: number;
  maxResults: number;
}) => {
  const config = quickBooksTxnQueryConfig[args.type];
  const whereParts = config.buildWhere({ startDate: args.startDate, endDate: args.endDate });
  const whereClause = whereParts.length > 0 ? ` where ${whereParts.join(' and ')}` : '';
  return `select * from ${config.queryType}${whereClause} order by TxnDate desc startposition ${args.startPosition} maxresults ${args.maxResults}`;
};

const buildQuickBooksCountQuery = (args: {
  type: QuickBooksLiveTransactionType;
  startDate?: string;
  endDate?: string;
}) => {
  const config = quickBooksTxnQueryConfig[args.type];
  const whereParts = config.buildWhere({ startDate: args.startDate, endDate: args.endDate });
  const whereClause = whereParts.length > 0 ? ` where ${whereParts.join(' and ')}` : '';
  return `select count(*) from ${config.queryType}${whereClause}`;
};

const extractQueryRows = (payload: Record<string, unknown>, key: string) =>
  toObjectArray((payload.QueryResponse as Record<string, unknown> | undefined)?.[key]);

const extractQuickBooksCount = (payload: Record<string, unknown>) => {
  const raw = (payload.QueryResponse as Record<string, unknown> | undefined)?.totalCount;
  const count = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(count) ? count : 0;
};

const sortRows = <T>(
  rows: T[],
  sort: 'date' | '-date' | 'amount' | '-amount',
  pickers: { date: (row: T) => string | null; amount: (row: T) => number | null }
) => {
  const factor = sort.startsWith('-') ? -1 : 1;
  const field = sort.endsWith('amount') ? 'amount' : 'date';
  return [...rows].sort((left, right) => {
    if (field === 'amount') {
      const leftValue = pickers.amount(left) ?? 0;
      const rightValue = pickers.amount(right) ?? 0;
      return (leftValue - rightValue) * factor;
    }
    const leftValue = pickers.date(left) ?? '';
    const rightValue = pickers.date(right) ?? '';
    return leftValue.localeCompare(rightValue) * factor;
  });
};

const chartAccountSortMap: Record<string, Record<string, 1 | -1>> = {
  name: { name: 1, _id: 1 },
  '-name': { name: -1, _id: -1 },
  type: { type: 1, name: 1, _id: 1 },
  '-type': { type: -1, name: 1, _id: -1 },
  status: { isSystem: 1, name: 1, _id: 1 },
  '-status': { isSystem: -1, name: 1, _id: -1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: -1 }
};

const normalizeAccountCode = (input: string | null, accountId: string) => {
  const cleaned = (input ?? '').trim().replace(/\s+/g, '');
  if (!cleaned) return `QB-${accountId}`;
  return cleaned.slice(0, 60);
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

const entitySortMap: Record<string, Record<string, 1 | -1>> = {
  displayName: { displayName: 1, _id: 1 },
  '-displayName': { displayName: -1, _id: -1 },
  status: { active: 1, displayName: 1, _id: 1 },
  '-status': { active: -1, displayName: 1, _id: -1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: -1 }
};

const operationSortMap: Record<string, Record<string, 1 | -1>> = {
  date: { date: 1, createdAt: 1, _id: 1 },
  '-date': { date: -1, createdAt: -1, _id: -1 },
  amount: { amount: 1, date: -1, _id: 1 },
  '-amount': { amount: -1, date: -1, _id: -1 },
  status: { 'posting.status': 1, date: -1, _id: 1 },
  '-status': { 'posting.status': -1, date: -1, _id: -1 },
  updatedAt: { updatedAt: 1, _id: 1 },
  '-updatedAt': { updatedAt: -1, _id: -1 }
};

type HubLiveChartItem = QuickBooksHubChartOfAccountsResponse['items'][number];

const normalizeQuickBooksAccountType = (accountType: string | null | undefined) =>
  (accountType ?? '').trim().toLowerCase();

const isQuickBooksBankAccount = (account: { accountType: string | null; active: boolean }) =>
  account.active && normalizeQuickBooksAccountType(account.accountType) === 'bank';

const isQuickBooksIncomeAccount = (account: { accountType: string | null; active: boolean }) => {
  const normalized = normalizeQuickBooksAccountType(account.accountType);
  return (
    account.active &&
    (normalized === 'income' ||
      normalized === 'other income' ||
      normalized.includes('income'))
  );
};

const isQuickBooksExpenseAccount = (account: { accountType: string | null; active: boolean }) =>
  account.active && normalizeQuickBooksAccountType(account.accountType) === 'expense';

const isQuickBooksDepositLineAccount = (account: { accountType: string | null; active: boolean }) => {
  if (!account.active) return false;
  if (isQuickBooksBankAccount(account)) return false;
  const mappedType = mapQuickBooksAccountType(account.accountType);
  if (mappedType === 'revenue' || mappedType === 'equity' || mappedType === 'liability') {
    return true;
  }
  if (mappedType === 'asset') {
    const normalized = normalizeQuickBooksAccountType(account.accountType);
    return normalized !== 'bank' && normalized !== 'accounts receivable';
  }
  return false;
};

const matchesHubAccountKind = (
  account: { accountType: string | null; active: boolean },
  accountKind: 'bank' | 'income' | 'expense' | 'deposit_line'
) => {
  if (!account.active) return false;
  if (accountKind === 'bank') return isQuickBooksBankAccount(account);
  if (accountKind === 'deposit_line') return isQuickBooksDepositLineAccount(account);
  const mappedType = mapQuickBooksAccountType(account.accountType);
  if (accountKind === 'income') return mappedType === 'revenue';
  return mappedType === 'expense' || isQuickBooksExpenseAccount(account);
};

const hubMongoTypesForAccountKind = (
  accountKind: 'bank' | 'income' | 'expense' | 'deposit_line'
): Array<'asset' | 'liability' | 'equity' | 'revenue' | 'expense'> => {
  if (accountKind === 'bank') return ['asset'];
  if (accountKind === 'income') return ['revenue'];
  if (accountKind === 'deposit_line') return ['revenue', 'liability', 'equity', 'asset'];
  return ['expense'];
};

const listQuickBooksHubChartOfAccountsFromMongoByKind = async (args: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort: 'name' | '-name' | 'type' | '-type' | 'status' | '-status' | 'updatedAt' | '-updatedAt';
  accountKind: 'bank' | 'income' | 'expense' | 'deposit_line';
}): Promise<QuickBooksHubChartOfAccountsResponse> => {
  const mongoTypes = hubMongoTypesForAccountKind(args.accountKind);
  const filter: Record<string, unknown> = {
    companyId: args.companyId,
    type: mongoTypes.length === 1 ? mongoTypes[0] : { $in: mongoTypes },
    isSystem: false
  };
  if (args.search) {
    const regex = new RegExp(escapeRegex(args.search), 'i');
    filter.$or = [{ name: regex }, { code: regex }, { qbAccountId: regex }];
  }

  const accounts = await ChartOfAccountModel.find(filter).sort(chartAccountSortMap[args.sort]).lean();
  let items = accounts.map((account) => ({
    id: account._id.toString(),
    qbId: account.qbAccountId ?? null,
    name: account.name,
    type: account.type ?? null,
    detailType: null,
    status: 'active' as const,
    balance: null
  }));

  if (args.accountKind === 'bank') {
    items = items.filter((item) => {
      const haystack = `${item.name ?? ''} ${item.detailType ?? ''}`.toLowerCase();
      return haystack.includes('bank') || haystack.includes('checking') || haystack.includes('savings');
    });
  } else if (args.accountKind === 'deposit_line') {
    items = items.filter((item) => {
      const haystack = `${item.name ?? ''} ${item.detailType ?? ''} ${item.type ?? ''}`.toLowerCase();
      if (haystack.includes('checking') || haystack.includes('savings') || haystack.includes('bank')) {
        return false;
      }
      return item.type === 'revenue' || item.type === 'liability' || item.type === 'equity' || item.type === 'asset';
    });
  }

  const total = items.length;
  const skip = (args.page - 1) * args.pageSize;
  const paged = items.slice(skip, skip + args.pageSize);
  return {
    ...toPageMeta(args.page, args.pageSize, total),
    items: paged
  };
};

const mapLiveQuickBooksAccountToHubItem = (account: {
  id: string;
  name: string;
  code: string | null;
  accountType: string | null;
  accountSubType: string | null;
  active: boolean;
}): HubLiveChartItem => ({
  id: account.id,
  qbId: account.id,
  name: account.name,
  type: mapQuickBooksAccountType(account.accountType),
  detailType: account.accountSubType,
  status: 'active',
  balance: null
});

const sortHubLiveChartItems = (
  items: HubLiveChartItem[],
  sort: 'name' | '-name' | 'type' | '-type' | 'status' | '-status' | 'updatedAt' | '-updatedAt'
) => {
  const factor = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');
  return [...items].sort((left, right) => {
    if (field === 'type') {
      const leftValue = `${left.type ?? ''} ${left.detailType ?? ''}`.toLowerCase();
      const rightValue = `${right.type ?? ''} ${right.detailType ?? ''}`.toLowerCase();
      return leftValue.localeCompare(rightValue) * factor;
    }
    if (field === 'status') {
      return left.status.localeCompare(right.status) * factor;
    }
    const leftName = left.name.toLowerCase();
    const rightName = right.name.toLowerCase();
    return leftName.localeCompare(rightName) * factor;
  });
};

const listQuickBooksHubChartOfAccountsFromLive = async (args: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort: 'name' | '-name' | 'type' | '-type' | 'status' | '-status' | 'updatedAt' | '-updatedAt';
  accountKind: 'bank' | 'income' | 'expense' | 'deposit_line';
}): Promise<QuickBooksHubChartOfAccountsResponse> => {
  const accounts = await listQuickBooksAccounts(args.companyId);
  let items = accounts
    .filter((account) => matchesHubAccountKind(account, args.accountKind))
    .map((account) => mapLiveQuickBooksAccountToHubItem(account));

  if (args.search) {
    const needle = args.search.trim().toLowerCase();
    items = items.filter((item) => {
      const haystack = `${item.name} ${item.qbId ?? ''} ${item.detailType ?? ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }

  const sortedItems = sortHubLiveChartItems(items, args.sort);
  const total = sortedItems.length;
  const skip = (args.page - 1) * args.pageSize;
  const paged = sortedItems.slice(skip, skip + args.pageSize);

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    items: paged
  };
};

export const listQuickBooksHubChartOfAccounts = async (args: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort: 'name' | '-name' | 'type' | '-type' | 'status' | '-status' | 'updatedAt' | '-updatedAt';
  type?: string;
  status?: 'active' | 'system';
  accountKind?: 'bank' | 'income' | 'expense' | 'deposit_line';
}): Promise<QuickBooksHubChartOfAccountsResponse> => {
  if (args.accountKind) {
    let liveItems: QuickBooksHubChartOfAccountsResponse['items'] = [];
    try {
      const live = await listQuickBooksHubChartOfAccountsFromLive({
        companyId: args.companyId,
        page: args.page,
        pageSize: args.pageSize,
        search: args.search,
        sort: args.sort,
        accountKind: args.accountKind
      });
      liveItems = live.items;
      if (liveItems.length > 0) {
        return live;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== 'quickbooks_not_connected') {
        throw error;
      }
    }

    const mongo = await listQuickBooksHubChartOfAccountsFromMongoByKind({
      companyId: args.companyId,
      page: args.page,
      pageSize: args.pageSize,
      search: args.search,
      sort: args.sort,
      accountKind: args.accountKind
    });
    if (mongo.items.length > 0) {
      return mongo;
    }

    return {
      ...toPageMeta(args.page, args.pageSize, 0),
      items: liveItems
    };
  }

  const filter: Record<string, unknown> = {
    companyId: args.companyId
  };

  if (args.search) {
    const regex = new RegExp(escapeRegex(args.search), 'i');
    filter.$or = [{ name: regex }, { code: regex }, { qbAccountId: regex }];
  }
  if (args.type) {
    filter.type = args.type;
  }
  if (args.status === 'system') {
    filter.isSystem = true;
  } else if (args.status === 'active') {
    filter.isSystem = false;
  }

  const skip = (args.page - 1) * args.pageSize;
  const [items, total] = await Promise.all([
    ChartOfAccountModel.find(filter)
      .sort(chartAccountSortMap[args.sort])
      .skip(skip)
      .limit(args.pageSize),
    ChartOfAccountModel.countDocuments(filter)
  ]);

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    items: items.map((account) => ({
      id: account._id.toString(),
      qbId: account.qbAccountId ?? null,
      name: account.name,
      type: account.type ?? null,
      detailType: null,
      status: account.isSystem ? 'system' : 'active',
      balance: null
    }))
  };
};

export const listQuickBooksHubItems = async (args: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
}) => {
  const { items, total } = await listQuickBooksItems(args.companyId, {
    search: args.search,
    page: args.page,
    pageSize: args.pageSize
  });
  return {
    ...toPageMeta(args.page, args.pageSize, total),
    items
  };
};

export const createQuickBooksHubItem = async (args: {
  companyId: string;
  name: string;
  type?: 'Service';
}) =>
  createQuickBooksItem({
    companyId: args.companyId,
    name: args.name,
    type: args.type
  });

export const createQuickBooksHubChartAccount = async (args: {
  companyId: string;
  name: string;
  accountNumber?: string;
  accountKind?: 'bank' | 'expense' | 'income';
  detailType?: 'Checking' | 'Savings' | 'CashOnHand';
}) => {
  const accountKind = args.accountKind ?? 'bank';
  const accountType =
    accountKind === 'expense' ? 'Expense' : accountKind === 'income' ? 'Income' : 'Bank';
  const accountSubType =
    accountKind === 'expense'
      ? 'OtherBusinessExpenses'
      : accountKind === 'income'
        ? 'SalesOfProductIncome'
        : args.detailType ?? 'Checking';

  const created = await createQuickBooksAccount({
    companyId: args.companyId,
    name: args.name,
    accountType,
    accountSubType,
    accountNumber: accountKind === 'bank' ? args.accountNumber : undefined
  });

  const qbAccountId = created.id;
  const existing = await ChartOfAccountModel.findOne({
    companyId: args.companyId,
    qbAccountId
  }).select('code');

  const code = existing?.code
    ? String(existing.code)
    : normalizeAccountCode(created.code, created.id);
  const mappedType = mapQuickBooksAccountType(created.accountType);

  const account = await ChartOfAccountModel.findOneAndUpdate(
    { companyId: args.companyId, qbAccountId },
    {
      $set: {
        companyId: args.companyId,
        code,
        name: created.name,
        type: mappedType,
        qbAccountId,
        isSystem: false
      }
    },
    { new: true, upsert: true }
  );

  return {
    id: account._id.toString(),
    qbId: account.qbAccountId ?? null,
    name: account.name,
    type: account.type ?? null,
    detailType: accountKind === 'bank' ? args.detailType ?? 'Checking' : null,
    status: account.isSystem ? 'system' : 'active',
    balance: null
  } as const;
};

export const listQuickBooksHubEntities = async (args: {
  companyId: string;
  entityType: 'customer' | 'vendor';
  page: number;
  pageSize: number;
  search?: string;
  sort:
    | 'displayName'
    | '-displayName'
    | 'status'
    | '-status'
    | 'balance'
    | '-balance'
    | 'updatedAt'
    | '-updatedAt';
  status?: 'active' | 'inactive';
}): Promise<QuickBooksHubEntitiesResponse> => {
  const filter: Record<string, unknown> = {
    companyId: args.companyId,
    entityType: args.entityType
  };

  if (args.search) {
    const regex = new RegExp(escapeRegex(args.search), 'i');
    filter.$or = [{ displayName: regex }, { qbId: regex }];
  }
  if (args.status === 'active') {
    filter.active = true;
  } else if (args.status === 'inactive') {
    filter.active = false;
  }

  const skip = (args.page - 1) * args.pageSize;

  if (args.sort === 'balance' || args.sort === '-balance') {
    const balanceOrder = args.sort === 'balance' ? 1 : -1;
    const balanceExpr = {
      $ifNull: [
        '$raw.Balance',
        { $ifNull: ['$raw.OpenBalance', { $ifNull: ['$raw.CurrentBalance', null] }] }
      ]
    };

    const [items, totalRows] = await Promise.all([
      QuickBooksReferenceModel.aggregate([
        { $match: filter },
        {
          $addFields: {
            balanceSort: {
              $convert: {
                input: balanceExpr,
                to: 'double',
                onError: null,
                onNull: null
              }
            }
          }
        },
        { $sort: { balanceSort: balanceOrder, displayName: 1, _id: 1 } },
        { $skip: skip },
        { $limit: args.pageSize }
      ]),
      QuickBooksReferenceModel.countDocuments(filter)
    ]);

    return {
      ...toPageMeta(args.page, args.pageSize, totalRows),
      items: items.map((entity: any) => ({
        id: String(entity._id),
        qbId: String(entity.qbId),
        entityType: entity.entityType,
        displayName: String(entity.displayName),
        email:
          readRawString(entity.raw, ['PrimaryEmailAddr', 'Address']) ??
          readRawString(entity.raw, ['BillEmail', 'Address']),
        phone:
          readRawString(entity.raw, ['PrimaryPhone', 'FreeFormNumber']) ??
          readRawString(entity.raw, ['Mobile', 'FreeFormNumber']) ??
          readRawString(entity.raw, ['MobilePhone', 'FreeFormNumber']),
        status: entity.active === false ? 'inactive' : 'active',
        balance: readRawNumber(entity.raw, [
          ['Balance'],
          ['OpenBalance'],
          ['CurrentBalance']
        ])
      }))
    };
  }

  const [items, total] = await Promise.all([
    QuickBooksReferenceModel.find(filter)
      .sort(entitySortMap[args.sort])
      .skip(skip)
      .limit(args.pageSize),
    QuickBooksReferenceModel.countDocuments(filter)
  ]);

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    items: items.map((entity) => ({
      id: entity._id.toString(),
      qbId: entity.qbId,
      entityType: args.entityType,
      displayName: entity.displayName,
      email:
        readRawString(entity.raw as Record<string, unknown> | undefined, [
          'PrimaryEmailAddr',
          'Address'
        ]) ??
        readRawString(entity.raw as Record<string, unknown> | undefined, ['BillEmail', 'Address']),
      phone:
        readRawString(entity.raw as Record<string, unknown> | undefined, [
          'PrimaryPhone',
          'FreeFormNumber'
        ]) ??
        readRawString(entity.raw as Record<string, unknown> | undefined, ['Mobile', 'FreeFormNumber']) ??
        readRawString(entity.raw as Record<string, unknown> | undefined, [
          'MobilePhone',
          'FreeFormNumber'
        ]),
      status: entity.active === false ? 'inactive' : 'active',
      balance: readRawNumber(entity.raw as Record<string, unknown> | undefined, [
        ['Balance'],
        ['OpenBalance'],
        ['CurrentBalance']
      ])
    }))
  };
};

export const listQuickBooksHubOperations = async (args: {
  companyId: string;
  page: number;
  pageSize: number;
  search?: string;
  sort:
    | 'date'
    | '-date'
    | 'amount'
    | '-amount'
    | 'status'
    | '-status'
    | 'updatedAt'
    | '-updatedAt';
  status?: 'not_posted' | 'posting' | 'posted' | 'failed';
  type?: 'Expense' | 'Deposit' | 'Transfer' | 'Check' | 'debit' | 'credit';
  startDate?: string;
  endDate?: string;
}): Promise<QuickBooksHubOperationsResponse> => {
  const filter: Record<string, unknown> = {
    companyId: args.companyId
  };

  if (args.status) {
    filter['posting.status'] = args.status;
  }
  if (args.type) {
    if (args.type === 'debit' || args.type === 'credit') {
      filter.type = args.type;
    } else {
      filter['proposal.qbTxnType'] = args.type;
    }
  }
  if (args.startDate || args.endDate) {
    filter.date = {
      ...(args.startDate ? { $gte: args.startDate } : {}),
      ...(args.endDate ? { $lte: args.endDate } : {})
    };
  }
  if (args.search) {
    const regex = new RegExp(escapeRegex(args.search), 'i');
    filter.$or = [
      { description: regex },
      { merchant: regex },
      { 'proposal.payeeName': regex },
      { 'proposal.memo': regex },
      { 'posting.qbTxnId': regex }
    ];
  }

  const skip = (args.page - 1) * args.pageSize;
  const [items, total] = await Promise.all([
    LedgerEntryModel.find(filter)
      .sort(operationSortMap[args.sort])
      .skip(skip)
      .limit(args.pageSize),
    LedgerEntryModel.countDocuments(filter)
  ]);

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    items: items.map((entry) => ({
      id: entry._id.toString(),
      date: entry.date,
      type: (entry.proposal?.qbTxnType ?? entry.type ?? null) as
        | 'Expense'
        | 'Deposit'
        | 'Transfer'
        | 'Check'
        | 'debit'
        | 'credit'
        | null,
      description: entry.description,
      payee: entry.proposal?.payeeName ?? entry.merchant ?? null,
      amount: Number(entry.amount),
      status: (entry.posting?.status ?? 'not_posted') as
        | 'not_posted'
        | 'posting'
        | 'posted'
        | 'failed',
      qbId: entry.posting?.qbTxnId ?? null,
      error: entry.posting?.error ?? null
    }))
  };
};

type RegisterColumnIndex = {
  date?: number;
  txnType?: number;
  docNum?: number;
  name?: number;
  memo?: number;
  splitAccount?: number;
  amount?: number;
  debit?: number;
  credit?: number;
  balance?: number;
};

// QuickBooks GeneralLedger reports do not have a stable column order across
// realms / minorversions / configurations. Some payloads include an explicit
// `Amount` column, others omit it; some include `Balance`, others do not.
// Always derive positions from the report's `Columns.Column` metadata
// (ColTitle + ColType) instead of assuming fixed indices, otherwise we end
// up reading the same value into Amount / Debit / Credit.
const buildRegisterColumnIndex = (raw: Record<string, unknown> | unknown): RegisterColumnIndex => {
  const columnsContainer = (raw && typeof raw === 'object'
    ? (raw as Record<string, unknown>).Columns
    : undefined) as Record<string, unknown> | undefined;
  const columns = toObjectArray(columnsContainer?.Column);
  const index: RegisterColumnIndex = {};
  columns.forEach((column, position) => {
    const title = (toNullableString(column.ColTitle) ?? '').trim().toLowerCase();
    const type = (toNullableString(column.ColType) ?? '').trim().toLowerCase();
    const assign = (key: keyof RegisterColumnIndex) => {
      if (index[key] == null) index[key] = position;
    };
    if (!title && !type) return;
    if (type === 'tx_date' || /^date$/.test(title) || /\bdate\b/.test(title)) {
      assign('date');
      return;
    }
    if (type === 'txn_type' || /\btype\b/.test(title) || /transaction\s*type/.test(title)) {
      assign('txnType');
      return;
    }
    if (type === 'doc_num' || /\b(num|no\.?|doc)\b/.test(title) || /^#$/.test(title)) {
      assign('docNum');
      return;
    }
    if (type === 'name' || /\bname\b/.test(title) || /\bpayee\b/.test(title)) {
      assign('name');
      return;
    }
    if (type === 'memo' || /\bmemo\b/.test(title) || /\bdescription\b/.test(title)) {
      assign('memo');
      return;
    }
    if (type === 'account' || /split\s*account/.test(title) || /\baccount\b/.test(title)) {
      assign('splitAccount');
      return;
    }
    if (/\bdebit\b/.test(title)) {
      assign('debit');
      return;
    }
    if (/\bcredit\b/.test(title)) {
      assign('credit');
      return;
    }
    if (/\bbalance\b/.test(title)) {
      assign('balance');
      return;
    }
    if (/\bamount\b/.test(title) || type === 'amount') {
      assign('amount');
    }
  });
  return index;
};

const FALLBACK_REGISTER_COLUMN_INDEX: RegisterColumnIndex = {
  date: 0,
  txnType: 1,
  docNum: 2,
  name: 3,
  memo: 4,
  splitAccount: 5,
  debit: 6,
  credit: 7,
  balance: 8
};

const readColumnValue = <T>(
  colData: Array<Record<string, unknown>>,
  position: number | undefined,
  reader: (raw: unknown) => T | null
): T | null => {
  if (position == null) return null;
  const cell = colData[position];
  if (!cell) return null;
  return reader(cell.value);
};

const parseRegisterRows = (
  accountId: string,
  rows: unknown,
  sort: 'date' | '-date' | 'amount' | '-amount',
  columnIndex: RegisterColumnIndex = FALLBACK_REGISTER_COLUMN_INDEX
) => {
  const parsed: QuickBooksAccountRegisterResponse['items'] = [];
  const hasAnyMappedColumn = Object.values(columnIndex).some((position) => position != null);
  const effectiveIndex = hasAnyMappedColumn ? columnIndex : FALLBACK_REGISTER_COLUMN_INDEX;
  const visit = (items: unknown, path: string[] = []) => {
    for (const row of toObjectArray(items)) {
      const header = readColData(row.Header);
      const headerLabel = readLabelFromColData(header);
      const nextPath = headerLabel ? [...path, headerLabel] : path;
      const colData = readColData(row);

      if (colData.length > 0) {
        const txnDate = readColumnValue(colData, effectiveIndex.date, toNullableString);
        const txnType = readColumnValue(colData, effectiveIndex.txnType, toNullableString);
        const docNum = readColumnValue(colData, effectiveIndex.docNum, toNullableString);
        const name = readColumnValue(colData, effectiveIndex.name, toNullableString);
        const memo = readColumnValue(colData, effectiveIndex.memo, toNullableString);
        const splitAccount = readColumnValue(colData, effectiveIndex.splitAccount, toNullableString);
        let debit = readColumnValue(colData, effectiveIndex.debit, toNumber);
        let credit = readColumnValue(colData, effectiveIndex.credit, toNumber);
        const explicitAmount = readColumnValue(colData, effectiveIndex.amount, toNumber);
        const balance = readColumnValue(colData, effectiveIndex.balance, toNumber);

        // Defensive: some QB layouts populate both Debit and Credit with the
        // same value (the gross amount) instead of placing it in only one
        // direction. In that case, treat the row as a debit when there is no
        // signed Amount column to disambiguate.
        if (debit != null && credit != null && Math.abs(debit - credit) < 0.005) {
          if (explicitAmount != null) {
            if (explicitAmount > 0) credit = null;
            else if (explicitAmount < 0) debit = null;
            else credit = null;
          } else {
            credit = null;
          }
        }
        const txnId =
          toNullableString((row as Record<string, unknown>).Id) ??
          [txnDate ?? '', txnType ?? '', docNum ?? '', memo ?? '', String(parsed.length + 1)].join(':');

        // Net signed amount: prefer the report's own Amount column when QB
        // provides one (some reports duplicate it across debit/credit), otherwise
        // fall back to debit (positive) or credit (negative).
        const netAmount =
          explicitAmount != null
            ? explicitAmount
            : debit != null && credit != null
              ? debit - credit
              : debit != null
                ? debit
                : credit != null
                  ? -credit
                  : null;

        if (txnDate || txnType || docNum || memo || name || debit != null || credit != null || explicitAmount != null) {
          parsed.push({
            id: txnId,
            accountId,
            date: txnDate,
            txnType,
            qbTxnId: txnId,
            docNum,
            name,
            memo,
            splitAccount: splitAccount ?? (nextPath.length > 0 ? nextPath[nextPath.length - 1] : null),
            amount: netAmount,
            debit,
            credit,
            balance
          });
        }
      }

      const childRows = (row.Rows as Record<string, unknown> | undefined)?.Row;
      if (childRows) {
        visit(childRows, nextPath);
      }
    }
  };

  visit(rows);

  return sortRows(parsed, sort, {
    date: (row) => row.date,
    amount: (row) => row.amount
  });
};

export const getQuickBooksAccountRegister = async (args: {
  companyId: string;
  accountId: string;
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
  page: number;
  pageSize: number;
  search?: string;
  sort: 'date' | '-date' | 'amount' | '-amount';
}): Promise<QuickBooksAccountRegisterResponse> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const raw = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/reports/GeneralLedger`,
    query: {
      start_date: args.from,
      end_date: args.to,
      accounting_method: toAccountingMethod(args.basis),
      account: args.accountId,
      minorversion: 75
    }
  })) as Record<string, unknown>;

  const columnIndex = buildRegisterColumnIndex(raw);
  let rows = parseRegisterRows(
    args.accountId,
    (raw.Rows as Record<string, unknown> | undefined)?.Row ?? [],
    args.sort,
    columnIndex
  );

  if (args.search) {
    const regex = new RegExp(escapeRegex(args.search), 'i');
    rows = rows.filter((row) =>
      [row.docNum, row.name, row.memo, row.splitAccount, row.txnType].some((value) =>
        value ? regex.test(value) : false
      )
    );
  }

  const total = rows.length;
  const skip = (args.page - 1) * args.pageSize;

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    accountId: args.accountId,
    from: args.from,
    to: args.to,
    basis: args.basis,
    items: rows.slice(skip, skip + args.pageSize)
  };
};

const mapLiveTransactionListItem = (
  type: QuickBooksLiveTransactionType,
  row: Record<string, unknown>
): QuickBooksLiveTransactionsResponse['items'][number] | null => {
  const qbTxnId = toNullableString(row.Id);
  const txnDate = toNullableString(row.TxnDate);
  if (!qbTxnId || !txnDate) {
    return null;
  }

  const payeeName =
    refName(row.EntityRef) ??
    refName(row.CustomerRef) ??
    refName(row.VendorRef) ??
    toNullableString(row.PayeeName);

  const accountName =
    refName(row.AccountRef) ??
    refName(row.DepositToAccountRef) ??
    refName(row.FromAccountRef) ??
    refName(row.ToAccountRef);

  return {
    id: qbTxnId,
    qbTxnId,
    type,
    txnDate,
    docNum: toNullableString(row.DocNumber) ?? toNullableString(row.DocNum),
    payeeName,
    accountName,
    amount:
      toNumber(row.TotalAmt) ??
      toNumber(row.Amount) ??
      toNumber((toObjectArray(row.Line)[0] as Record<string, unknown> | undefined)?.Amount),
    memo: toNullableString(row.PrivateNote),
    status: 'posted'
  };
};

export const listQuickBooksLiveTransactions = async (args: {
  companyId: string;
  type: QuickBooksLiveTransactionType;
  page: number;
  pageSize: number;
  search?: string;
  sort: 'date' | '-date' | 'amount' | '-amount';
  startDate?: string;
  endDate?: string;
}): Promise<QuickBooksLiveTransactionsResponse> => {
  const query = buildQuickBooksListQuery({
    type: args.type,
    startDate: args.startDate,
    endDate: args.endDate,
    startPosition: 1,
    maxResults: 1000
  });
  const [payload, countPayload] = await Promise.all([
    runQuickBooksReadQuery(args.companyId, query),
    runQuickBooksReadQuery(
      args.companyId,
      buildQuickBooksCountQuery({
        type: args.type,
        startDate: args.startDate,
        endDate: args.endDate
      })
    )
  ]);

  const config = quickBooksTxnQueryConfig[args.type];
  let items = extractQueryRows(payload, config.queryType)
    .map((row) => mapLiveTransactionListItem(args.type, row))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (args.search) {
    const regex = new RegExp(escapeRegex(args.search), 'i');
    items = items.filter((row) =>
      [row.docNum, row.payeeName, row.accountName, row.memo].some((value) =>
        value ? regex.test(value) : false
      )
    );
  }

  items = sortRows(items, args.sort, {
    date: (row) => row.txnDate,
    amount: (row) => row.amount
  });

  const total = args.search ? items.length : extractQuickBooksCount(countPayload);
  const skip = (args.page - 1) * args.pageSize;

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    type: args.type,
    items: items.slice(skip, skip + args.pageSize)
  };
};

export const getQuickBooksTransactionDetail = async (args: {
  companyId: string;
  qbTxnId: string;
  type: QuickBooksLiveTransactionType;
}): Promise<QuickBooksTransactionDetail> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const config = quickBooksTxnQueryConfig[args.type];
  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/${config.detailType.toLowerCase()}/${args.qbTxnId}`,
    query: {
      minorversion: 75
    }
  })) as Record<string, unknown>;

  const raw = (payload[config.detailType] as Record<string, unknown> | undefined) ?? payload;
  const firstLine = toObjectArray(raw.Line)[0];
  const expenseDetail =
    (readNested(firstLine, ['AccountBasedExpenseLineDetail']) as Record<string, unknown> | null) ??
    null;
  const depositDetail =
    (readNested(firstLine, ['DepositLineDetail']) as Record<string, unknown> | null) ?? null;

  return {
    id: args.qbTxnId,
    qbTxnId: args.qbTxnId,
    type: args.type,
    txnDate: toNullableString(raw.TxnDate),
    docNum: toNullableString(raw.DocNumber) ?? toNullableString(raw.DocNum),
    syncToken: toNullableString(raw.SyncToken),
    payeeId:
      refValue(raw.EntityRef) ??
      refValue(raw.CustomerRef) ??
      refValue(raw.VendorRef) ??
      null,
    payeeName:
      refName(raw.EntityRef) ??
      refName(raw.CustomerRef) ??
      refName(raw.VendorRef) ??
      null,
    memo: toNullableString(raw.PrivateNote),
    amount:
      toNumber(raw.TotalAmt) ??
      toNumber(raw.Amount) ??
      toNumber((firstLine as Record<string, unknown> | undefined)?.Amount),
    accountId:
      refValue(raw.AccountRef) ??
      refValue(raw.DepositToAccountRef) ??
      refValue(raw.FromAccountRef) ??
      null,
    accountName:
      refName(raw.AccountRef) ??
      refName(raw.DepositToAccountRef) ??
      refName(raw.FromAccountRef) ??
      null,
    categoryAccountId:
      refValue(expenseDetail?.AccountRef) ?? refValue(depositDetail?.AccountRef) ?? null,
    categoryAccountName:
      refName(expenseDetail?.AccountRef) ?? refName(depositDetail?.AccountRef) ?? null,
    fromAccountId: refValue(raw.FromAccountRef),
    fromAccountName: refName(raw.FromAccountRef),
    toAccountId: refValue(raw.ToAccountRef),
    toAccountName: refName(raw.ToAccountRef),
    raw
  };
};

export const listQuickBooksTaxLedger = async (args: {
  companyId: string;
  from: string;
  to: string;
  basis: QuickBooksTaxBasis;
  accountId?: string;
  limit: number;
  cursor?: string;
}): Promise<QuickBooksTaxLedgerResponse> => {
  const report = await fetchQuickBooksTaxReport({
    companyId: args.companyId,
    reportKey: 'general-ledger',
    from: args.from,
    to: args.to,
    basis: args.basis
  });

  const offset = Math.max(0, Number.parseInt(args.cursor ?? '0', 10) || 0);
  const filtered = report.rows.filter((row) => row.amount != null);
  const page = filtered.slice(offset, offset + args.limit);

  const entries: QuickBooksTaxLedgerEntry[] = page.map((row, index) => ({
    id: String(offset + index + 1),
    txnDate: parseDateFromLabel(row.label),
    description: row.label,
    accountId: args.accountId ?? null,
    accountName: row.path.length > 0 ? row.path[row.path.length - 1] : null,
    amount: row.amount,
    raw: {
      path: row.path
    }
  }));

  const nextCursor =
    offset + args.limit < filtered.length ? String(offset + args.limit) : null;

  return {
    from: args.from,
    to: args.to,
    basis: args.basis,
    accountId: args.accountId ?? null,
    total: filtered.length,
    nextCursor,
    entries
  };
};

const mapCustomerPayment = (row: Record<string, unknown>): QuickBooksTaxPayment => ({
  id: String(row.Id ?? '').trim(),
  paymentType: 'customer',
  sourceTxnType: 'Payment',
  txnDate: String(row.TxnDate ?? '').trim(),
  amount: Number(row.TotalAmt ?? 0),
  entityId:
    typeof row.CustomerRef === 'object' && row.CustomerRef
      ? String((row.CustomerRef as Record<string, unknown>).value ?? '').trim() || null
      : null,
  entityName:
    typeof row.CustomerRef === 'object' && row.CustomerRef
      ? String((row.CustomerRef as Record<string, unknown>).name ?? '').trim() || null
      : null,
  memo: String(row.PrivateNote ?? '').trim() || null,
  raw: row
});

const mapVendorPayment = (row: Record<string, unknown>): QuickBooksTaxPayment => ({
  id: String(row.Id ?? '').trim(),
  paymentType: 'vendor',
  sourceTxnType: 'Purchase',
  txnDate: String(row.TxnDate ?? '').trim(),
  amount: Number(row.TotalAmt ?? 0),
  entityId:
    typeof row.EntityRef === 'object' && row.EntityRef
      ? String((row.EntityRef as Record<string, unknown>).value ?? '').trim() || null
      : null,
  entityName:
    typeof row.EntityRef === 'object' && row.EntityRef
      ? String((row.EntityRef as Record<string, unknown>).name ?? '').trim() || null
      : null,
  memo: String(row.PrivateNote ?? '').trim() || null,
  raw: row
});

export const listQuickBooksTaxPayments = async (args: {
  companyId: string;
  from: string;
  to: string;
  type: 'customer' | 'vendor' | 'all';
  limit: number;
  cursor?: string;
}): Promise<QuickBooksTaxPaymentsResponse> => {
  const startPosition = Math.max(1, Number.parseInt(args.cursor ?? '1', 10) || 1);
  const escapedFrom = qbEscape(args.from);
  const escapedTo = qbEscape(args.to);

  if (args.type === 'customer') {
    const payload = (await runQuickBooksReadQuery(
      args.companyId,
      `select * from Payment where TxnDate >= '${escapedFrom}' and TxnDate <= '${escapedTo}' order by TxnDate desc startposition ${startPosition} maxresults ${args.limit}`
    )) as Record<string, unknown>;

    const rows = toObjectArray(
      (payload.QueryResponse as Record<string, unknown> | undefined)?.Payment
    );
    const payments = rows.map(mapCustomerPayment).filter((row) => Boolean(row.id));
    const nextCursor = rows.length === args.limit ? String(startPosition + args.limit) : null;
    return {
      from: args.from,
      to: args.to,
      type: 'customer',
      nextCursor,
      payments
    };
  }

  if (args.type === 'vendor') {
    const payload = (await runQuickBooksReadQuery(
      args.companyId,
      `select * from Purchase where PaymentType = 'Check' and TxnDate >= '${escapedFrom}' and TxnDate <= '${escapedTo}' order by TxnDate desc startposition ${startPosition} maxresults ${args.limit}`
    )) as Record<string, unknown>;

    const rows = toObjectArray(
      (payload.QueryResponse as Record<string, unknown> | undefined)?.Purchase
    );
    const payments = rows.map(mapVendorPayment).filter((row) => Boolean(row.id));
    const nextCursor = rows.length === args.limit ? String(startPosition + args.limit) : null;
    return {
      from: args.from,
      to: args.to,
      type: 'vendor',
      nextCursor,
      payments
    };
  }

  const [customer, vendor] = await Promise.all([
    listQuickBooksTaxPayments({
      companyId: args.companyId,
      from: args.from,
      to: args.to,
      type: 'customer',
      limit: args.limit
    }),
    listQuickBooksTaxPayments({
      companyId: args.companyId,
      from: args.from,
      to: args.to,
      type: 'vendor',
      limit: args.limit
    })
  ]);

  const merged = [...customer.payments, ...vendor.payments]
    .sort((left, right) => right.txnDate.localeCompare(left.txnDate))
    .slice(0, args.limit);

  return {
    from: args.from,
    to: args.to,
    type: 'all',
    nextCursor: null,
    payments: merged
  };
};

const findExistingPaymentByTag = async (
  companyId: string,
  paymentType: 'customer' | 'vendor',
  tag: string
) => {
  const escapedTag = qbEscape(tag);
  if (paymentType === 'customer') {
    const payload = (await runQuickBooksReadQuery(
      companyId,
      `select Id, TxnDate, TotalAmt, PrivateNote from Payment where PrivateNote like '%${escapedTag}%' startposition 1 maxresults 1`
    )) as Record<string, unknown>;
    const row = toObjectArray(
      (payload.QueryResponse as Record<string, unknown> | undefined)?.Payment
    )[0];
    if (!row) return null;
    return {
      txnId: String(row.Id ?? '').trim(),
      txnDate: String(row.TxnDate ?? '').trim(),
      amount: Number(row.TotalAmt ?? 0),
      txnType: 'Payment' as const
    };
  }

  const payload = (await runQuickBooksReadQuery(
    companyId,
    `select Id, TxnDate, TotalAmt, PrivateNote from Purchase where PaymentType = 'Check' and PrivateNote like '%${escapedTag}%' startposition 1 maxresults 1`
  )) as Record<string, unknown>;
  const row = toObjectArray(
    (payload.QueryResponse as Record<string, unknown> | undefined)?.Purchase
  )[0];
  if (!row) return null;
  return {
    txnId: String(row.Id ?? '').trim(),
    txnDate: String(row.TxnDate ?? '').trim(),
    amount: Number(row.TotalAmt ?? 0),
    txnType: 'Purchase' as const
  };
};

export const recoverQuickBooksPayment = async (
  companyId: string,
  input: QuickBooksRecoverPaymentInput
): Promise<QuickBooksRecoverPaymentResult> => {
  const startedAt = Date.now();
  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const tag = idempotencyTag(input.clientRequestId);
  const existing = await findExistingPaymentByTag(companyId, input.paymentType, tag);
  if (existing?.txnId) {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.recover-payment.result]', {
      companyId,
      paymentType: input.paymentType,
      created: false,
      paymentId: existing.txnId,
      clientRequestId: input.clientRequestId,
      latencyMs: Date.now() - startedAt
    });
    return {
      created: false,
      clientRequestId: input.clientRequestId,
      paymentId: existing.txnId,
      txnType: existing.txnType,
      txnDate: existing.txnDate || input.txnDate,
      amount: existing.amount || input.amount
    };
  }

  const memo = `${tag}${input.memo ? ` ${input.memo}` : ''}`;
  if (input.paymentType === 'customer') {
    if (!input.customerId) {
      throw new Error('quickbooks_customer_id_required');
    }
    const payload = (await requestQuickBooksApi({
      companyId,
      method: 'POST',
      path: `/v3/company/${secret.realmId}/payment`,
      query: { minorversion: 75 },
      body: {
        TxnDate: input.txnDate,
        TotalAmt: Number(input.amount.toFixed(2)),
        CustomerRef: { value: input.customerId },
        DepositToAccountRef: { value: input.bankAccountId },
        PrivateNote: memo
      }
    })) as Record<string, unknown>;

    const payment = payload.Payment as Record<string, unknown> | undefined;
    const paymentId = String(payment?.Id ?? '').trim();
    if (!paymentId) {
      throw new Error('quickbooks_payment_id_missing');
    }

    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.recover-payment.result]', {
      companyId,
      paymentType: input.paymentType,
      created: true,
      paymentId,
      clientRequestId: input.clientRequestId,
      latencyMs: Date.now() - startedAt
    });

    return {
      created: true,
      clientRequestId: input.clientRequestId,
      paymentId,
      txnType: 'Payment',
      txnDate: String(payment?.TxnDate ?? input.txnDate),
      amount: Number(payment?.TotalAmt ?? input.amount)
    };
  }

  if (!input.vendorId || !input.categoryAccountId) {
    throw new Error('quickbooks_vendor_payment_fields_missing');
  }

  const result = await createQuickBooksCheckTransaction({
    companyId,
    txnDate: input.txnDate,
    amount: input.amount,
    bankAccountId: input.bankAccountId,
    categoryAccountId: input.categoryAccountId,
    payeeRefId: input.vendorId,
    memo
  });

  // eslint-disable-next-line no-console
  console.info('[quickbooks.tax.recover-payment.result]', {
    companyId,
    paymentType: input.paymentType,
    created: true,
    paymentId: result.txnId,
    clientRequestId: input.clientRequestId,
    latencyMs: Date.now() - startedAt
  });

  return {
    created: true,
    clientRequestId: input.clientRequestId,
    paymentId: result.txnId,
    txnType: 'Purchase',
    txnDate: result.txnDate || input.txnDate,
    amount: Number(input.amount)
  };
};

const findExistingJournalByTag = async (companyId: string, tag: string) => {
  const payload = (await runQuickBooksReadQuery(
    companyId,
    `select Id, TxnDate, PrivateNote from JournalEntry where PrivateNote like '%${qbEscape(
      tag
    )}%' startposition 1 maxresults 1`
  )) as Record<string, unknown>;

  const row = toObjectArray(
    (payload.QueryResponse as Record<string, unknown> | undefined)?.JournalEntry
  )[0];
  if (!row) {
    return null;
  }
  return {
    journalEntryId: String(row.Id ?? '').trim(),
    txnDate: String(row.TxnDate ?? '').trim()
  };
};

export const createQuickBooksJournalAdjustment = async (
  companyId: string,
  input: QuickBooksJournalAdjustmentInput
): Promise<QuickBooksJournalAdjustmentResult> => {
  const startedAt = Date.now();
  const tag = idempotencyTag(input.clientRequestId);
  const existing = await findExistingJournalByTag(companyId, tag);
  if (existing?.journalEntryId) {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.journal-adjustment.result]', {
      companyId,
      created: false,
      journalEntryId: existing.journalEntryId,
      clientRequestId: input.clientRequestId,
      latencyMs: Date.now() - startedAt
    });
    return {
      created: false,
      clientRequestId: input.clientRequestId,
      journalEntryId: existing.journalEntryId,
      txnDate: existing.txnDate || input.txnDate
    };
  }

  const lines = input.lines.map((line) => {
    const debit = Number(line.debit ?? 0);
    const credit = Number(line.credit ?? 0);
    if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
      throw new Error('quickbooks_journal_line_invalid');
    }
    return {
      accountId: line.accountId,
      amount: debit > 0 ? debit : credit,
      postingType: debit > 0 ? ('Debit' as const) : ('Credit' as const),
      description: line.description
    };
  });

  const debitTotal = lines
    .filter((line) => line.postingType === 'Debit')
    .reduce((sum, line) => sum + line.amount, 0);
  const creditTotal = lines
    .filter((line) => line.postingType === 'Credit')
    .reduce((sum, line) => sum + line.amount, 0);
  if (Math.abs(debitTotal - creditTotal) > 0.009) {
    throw new Error('quickbooks_unbalanced_journal');
  }

  const privateNote = `${tag}${input.memo ? ` ${input.memo}` : ''}`;
  const created = await createQuickBooksJournalEntry({
    companyId,
    txnDate: input.txnDate,
    privateNote,
    lines
  });

  // eslint-disable-next-line no-console
  console.info('[quickbooks.tax.journal-adjustment.result]', {
    companyId,
    created: true,
    journalEntryId: created.journalEntryId,
    clientRequestId: input.clientRequestId,
    latencyMs: Date.now() - startedAt
  });

  return {
    created: true,
    clientRequestId: input.clientRequestId,
    journalEntryId: created.journalEntryId,
    txnDate: created.txnDate || input.txnDate
  };
};
