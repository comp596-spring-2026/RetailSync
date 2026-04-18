import type {
  QuickBooksMoneyCreateInput,
  QuickBooksMoneyDeleteResult,
  QuickBooksMoneyTxnType,
  QuickBooksMoneyUpdateInput,
  QuickBooksTransactionDetail
} from '@retailsync/shared';
import { ensureFreshQuickBooksSecret, requestQuickBooksApi } from '../integrations/quickbooks';

const quickBooksMoneyConfig: Record<
  QuickBooksMoneyTxnType,
  { endpoint: 'purchase' | 'deposit' | 'transfer'; paymentType?: 'Check' | 'Cash' }
> = {
  check: { endpoint: 'purchase', paymentType: 'Check' },
  expense: { endpoint: 'purchase', paymentType: 'Cash' },
  deposit: { endpoint: 'deposit' },
  transfer: { endpoint: 'transfer' }
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const toTrimmedString = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value).trim();
  return '';
};

const toNullableString = (value: unknown): string | null => {
  const trimmed = toTrimmedString(value);
  return trimmed || null;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readNested = (value: unknown, path: string[]) => {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const refValue = (value: unknown): string | null =>
  toNullableString(readNested(value, ['value'])) ?? toNullableString(value);

const refName = (value: unknown): string | null => toNullableString(readNested(value, ['name']));

const detailContainerKey: Record<QuickBooksMoneyTxnType, 'Purchase' | 'Deposit' | 'Transfer'> = {
  check: 'Purchase',
  expense: 'Purchase',
  deposit: 'Deposit',
  transfer: 'Transfer'
};

const mapMoneyDetail = (
  txnType: QuickBooksMoneyTxnType,
  qbTxnId: string,
  raw: Record<string, unknown>
): QuickBooksTransactionDetail => {
  const firstLine = (Array.isArray(raw.Line) ? raw.Line[0] : null) as Record<string, unknown> | null;
  const expenseDetail =
    toRecord(readNested(firstLine, ['AccountBasedExpenseLineDetail'])) ?? null;
  const depositDetail =
    toRecord(readNested(firstLine, ['DepositLineDetail'])) ?? null;

  return {
    id: qbTxnId,
    qbTxnId,
    type: txnType,
    txnDate: toNullableString(raw.TxnDate),
    docNum: toNullableString(raw.DocNumber) ?? toNullableString(raw.DocNum),
    syncToken: toNullableString(raw.SyncToken),
    payeeId: refValue(raw.EntityRef) ?? refValue(raw.CustomerRef) ?? refValue(raw.VendorRef),
    payeeName: refName(raw.EntityRef) ?? refName(raw.CustomerRef) ?? refName(raw.VendorRef),
    memo: toNullableString(raw.PrivateNote),
    amount:
      toNumber(raw.TotalAmt) ??
      toNumber(raw.Amount) ??
      toNumber(firstLine?.Amount),
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

const buildMoneyCreateBody = (input: QuickBooksMoneyCreateInput): Record<string, unknown> => {
  if (input.txnType === 'check' || input.txnType === 'expense') {
    return {
      TxnDate: input.txnDate,
      PaymentType: input.txnType === 'check' ? 'Check' : 'Cash',
      AccountRef: { value: input.bankAccountId },
      ...(input.payeeRefId ? { EntityRef: { value: input.payeeRefId } } : {}),
      ...(input.memo?.trim() ? { PrivateNote: input.memo.trim() } : {}),
      Line: [
        {
          Amount: Number(Math.abs(input.amount).toFixed(2)),
          Description: input.memo?.trim() || undefined,
          DetailType: 'AccountBasedExpenseLineDetail',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: input.categoryAccountId }
          }
        }
      ]
    };
  }

  if (input.txnType === 'deposit') {
    return {
      TxnDate: input.txnDate,
      ...(input.memo?.trim() ? { PrivateNote: input.memo.trim() } : {}),
      DepositToAccountRef: { value: input.bankAccountId },
      Line: [
        {
          Amount: Number(Math.abs(input.amount).toFixed(2)),
          Description: input.memo?.trim() || undefined,
          DetailType: 'DepositLineDetail',
          DepositLineDetail: {
            AccountRef: { value: input.categoryAccountId }
          }
        }
      ]
    };
  }

  return {
    TxnDate: input.txnDate,
    Amount: Number(Math.abs(input.amount).toFixed(2)),
    FromAccountRef: { value: input.fromAccountId },
    ToAccountRef: { value: input.toAccountId },
    ...(input.memo?.trim() ? { PrivateNote: input.memo.trim() } : {})
  };
};

const buildMoneyUpdateBody = (
  qbTxnId: string,
  syncToken: string,
  input: QuickBooksMoneyUpdateInput
) => ({
  Id: qbTxnId,
  SyncToken: syncToken,
  sparse: true,
  ...buildMoneyCreateBody(input)
});

const getMoneyRaw = async (args: {
  companyId: string;
  txnType: QuickBooksMoneyTxnType;
  qbTxnId: string;
}) => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const config = quickBooksMoneyConfig[args.txnType];
  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'GET',
    path: `/v3/company/${secret.realmId}/${config.endpoint}/${args.qbTxnId}`,
    query: { minorversion: 75 }
  })) as Record<string, unknown>;

  const container =
    toRecord(payload[detailContainerKey[args.txnType]]) ?? payload;

  return { secret, raw: container };
};

export const createQuickBooksMoneyTransaction = async (args: {
  companyId: string;
  input: QuickBooksMoneyCreateInput;
}): Promise<QuickBooksTransactionDetail> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const config = quickBooksMoneyConfig[args.input.txnType];
  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${secret.realmId}/${config.endpoint}`,
    query: { minorversion: 75 },
    body: buildMoneyCreateBody(args.input)
  })) as Record<string, unknown>;

  const raw = toRecord(payload[detailContainerKey[args.input.txnType]]) ?? payload;
  const qbTxnId = toTrimmedString(raw.Id);
  if (!qbTxnId) {
    throw new Error(`quickbooks_${args.input.txnType}_id_missing`);
  }

  return mapMoneyDetail(args.input.txnType, qbTxnId, raw);
};

export const updateQuickBooksMoneyTransaction = async (args: {
  companyId: string;
  txnType: QuickBooksMoneyTxnType;
  qbTxnId: string;
  input: QuickBooksMoneyUpdateInput;
}): Promise<QuickBooksTransactionDetail> => {
  const current = await getMoneyRaw(args);
  const syncToken = toTrimmedString(current.raw.SyncToken);
  if (!syncToken) {
    throw new Error('quickbooks_api_fault:sync token missing');
  }

  const config = quickBooksMoneyConfig[args.txnType];
  const payload = (await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${current.secret.realmId}/${config.endpoint}`,
    query: { minorversion: 75 },
    body: buildMoneyUpdateBody(args.qbTxnId, syncToken, args.input)
  })) as Record<string, unknown>;

  const raw = toRecord(payload[detailContainerKey[args.txnType]]) ?? payload;
  return mapMoneyDetail(args.txnType, args.qbTxnId, raw);
};

export const deleteQuickBooksMoneyTransaction = async (args: {
  companyId: string;
  txnType: QuickBooksMoneyTxnType;
  qbTxnId: string;
}): Promise<QuickBooksMoneyDeleteResult> => {
  const current = await getMoneyRaw(args);
  const syncToken = toTrimmedString(current.raw.SyncToken);
  if (!syncToken) {
    throw new Error('quickbooks_api_fault:sync token missing');
  }

  const config = quickBooksMoneyConfig[args.txnType];
  await requestQuickBooksApi({
    companyId: args.companyId,
    method: 'POST',
    path: `/v3/company/${current.secret.realmId}/${config.endpoint}`,
    query: {
      minorversion: 75,
      operation: 'delete'
    },
    body: {
      Id: args.qbTxnId,
      SyncToken: syncToken
    }
  });

  return {
    txnType: args.txnType,
    qbTxnId: args.qbTxnId,
    deleted: true
  };
};
