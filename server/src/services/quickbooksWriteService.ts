import type {
  QuickBooksWriteCreateInput,
  QuickBooksWriteDetail,
  QuickBooksWriteLine,
  QuickBooksWriteLinkedTransaction,
  QuickBooksWriteListItem,
  QuickBooksWriteListQuery,
  QuickBooksWriteListResponse,
  QuickBooksWritePaymentLinkInput,
  QuickBooksWriteStatus,
  QuickBooksWriteTxnType,
  QuickBooksWriteUpdateInput
} from '@retailsync/shared';
import {
  ensureFreshQuickBooksSecret,
  requestQuickBooksApi,
  runQuickBooksReadQuery
} from '../integrations/quickbooks';

const qbEscape = (value: string) => value.replace(/'/g, "\\'");

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

const refName = (value: unknown): string | null => toNullableString(readNested(value, ['name']));

const toPageMeta = (page: number, pageSize: number, total: number) => ({
  page,
  pageSize,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / pageSize)
});

const writeTxnConfig: Record<
  QuickBooksWriteTxnType,
  {
    queryType: 'SalesReceipt' | 'Invoice' | 'Payment';
    path: 'salesreceipt' | 'invoice' | 'payment';
    payloadKey: 'SalesReceipt' | 'Invoice' | 'Payment';
  }
> = {
  'sales-receipt': {
    queryType: 'SalesReceipt',
    path: 'salesreceipt',
    payloadKey: 'SalesReceipt'
  },
  invoice: {
    queryType: 'Invoice',
    path: 'invoice',
    payloadKey: 'Invoice'
  },
  payment: {
    queryType: 'Payment',
    path: 'payment',
    payloadKey: 'Payment'
  }
};

const sortRows = <T>(
  rows: T[],
  sort: QuickBooksWriteListQuery['sort'],
  pickers: {
    date: (row: T) => string | null;
    totalAmount: (row: T) => number | null;
    docNumber: (row: T) => string | null;
  }
) => {
  const factor = sort.startsWith('-') ? -1 : 1;
  const field = sort.endsWith('totalAmount')
    ? 'totalAmount'
    : sort.endsWith('docNumber')
      ? 'docNumber'
      : 'date';

  return [...rows].sort((left, right) => {
    if (field === 'totalAmount') {
      const leftValue = pickers.totalAmount(left) ?? 0;
      const rightValue = pickers.totalAmount(right) ?? 0;
      return (leftValue - rightValue) * factor;
    }

    if (field === 'docNumber') {
      const leftValue = pickers.docNumber(left) ?? '';
      const rightValue = pickers.docNumber(right) ?? '';
      return leftValue.localeCompare(rightValue) * factor;
    }

    const leftValue = pickers.date(left) ?? '';
    const rightValue = pickers.date(right) ?? '';
    return leftValue.localeCompare(rightValue) * factor;
  });
};

const buildWhereParts = (args: {
  startDate?: string;
  endDate?: string;
  customerId?: string;
}) => [
  ...(args.startDate ? [`TxnDate >= '${qbEscape(args.startDate)}'`] : []),
  ...(args.endDate ? [`TxnDate <= '${qbEscape(args.endDate)}'`] : []),
  ...(args.customerId ? [`CustomerRef = '${qbEscape(args.customerId)}'`] : [])
];

const buildListQuery = (
  txnType: QuickBooksWriteTxnType,
  args: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
    startPosition: number;
    maxResults: number;
  }
) => {
  const whereParts = buildWhereParts(args);
  const whereClause = whereParts.length > 0 ? ` where ${whereParts.join(' and ')}` : '';
  return `select * from ${writeTxnConfig[txnType].queryType}${whereClause} order by TxnDate desc startposition ${args.startPosition} maxresults ${args.maxResults}`;
};

const buildCountQuery = (
  txnType: QuickBooksWriteTxnType,
  args: {
    startDate?: string;
    endDate?: string;
    customerId?: string;
  }
) => {
  const whereParts = buildWhereParts(args);
  const whereClause = whereParts.length > 0 ? ` where ${whereParts.join(' and ')}` : '';
  return `select count(*) from ${writeTxnConfig[txnType].queryType}${whereClause}`;
};

const extractQuickBooksCount = (payload: Record<string, unknown>) => {
  const raw = (payload.QueryResponse as Record<string, unknown> | undefined)?.totalCount;
  const count = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(count) ? count : 0;
};

const getDocNumber = (raw: Record<string, unknown>) =>
  toNullableString(raw.DocNumber) ??
  toNullableString(raw.DocNum) ??
  toNullableString(raw.PaymentRefNum);

const getCurrencyCode = (raw: Record<string, unknown>) =>
  refName(raw.CurrencyRef) ?? refValue(raw.CurrencyRef);

const getCustomerEmail = (raw: Record<string, unknown>) =>
  toNullableString(readNested(raw, ['BillEmail', 'Address'])) ??
  toNullableString(readNested(raw, ['PrimaryEmailAddr', 'Address']));

const getStatus = (
  txnType: QuickBooksWriteTxnType,
  raw: Record<string, unknown>
): QuickBooksWriteStatus => {
  if (txnType === 'sales-receipt') {
    return 'closed';
  }

  if (txnType === 'invoice') {
    const balance = toNumber(raw.Balance);
    if (balance == null) return 'unknown';
    return Math.abs(balance) <= 0.009 ? 'paid' : 'open';
  }

  const unappliedAmount = toNumber(raw.UnappliedAmt);
  if (unappliedAmount == null) return 'unknown';
  return unappliedAmount > 0.009 ? 'unapplied' : 'applied';
};

const mapListItem = (
  txnType: QuickBooksWriteTxnType,
  raw: Record<string, unknown>
): QuickBooksWriteListItem | null => {
  const qbTxnId = toNullableString(raw.Id);
  if (!qbTxnId) {
    return null;
  }

  return {
    id: qbTxnId,
    qbTxnId,
    txnType,
    txnDate: toNullableString(raw.TxnDate),
    docNumber: getDocNumber(raw),
    customerId: refValue(raw.CustomerRef),
    customerName: refName(raw.CustomerRef),
    totalAmount: toNumber(raw.TotalAmt),
    balanceAmount:
      txnType === 'invoice'
        ? toNumber(raw.Balance)
        : txnType === 'payment'
          ? toNumber(raw.UnappliedAmt)
          : 0,
    currencyCode: getCurrencyCode(raw),
    status: getStatus(txnType, raw),
    emailStatus: toNullableString(raw.EmailStatus),
    memo: toNullableString(raw.PrivateNote)
  };
};

const mapLine = (rawLine: Record<string, unknown>): QuickBooksWriteLine => {
  const salesDetail =
    (readNested(rawLine, ['SalesItemLineDetail']) as Record<string, unknown> | null) ?? null;

  return {
    id: toNullableString(rawLine.Id),
    detailType: toNullableString(rawLine.DetailType),
    description: toNullableString(rawLine.Description),
    amount: Number(toNumber(rawLine.Amount) ?? 0),
    itemId: refValue(salesDetail?.ItemRef),
    itemName: refName(salesDetail?.ItemRef),
    quantity: toNumber(salesDetail?.Qty),
    unitPrice: toNumber(salesDetail?.UnitPrice),
    taxCodeId: refValue(salesDetail?.TaxCodeRef),
    taxCodeName: refName(salesDetail?.TaxCodeRef),
    serviceDate: toNullableString(salesDetail?.ServiceDate)
  };
};

const mapLinkedTransactions = (raw: Record<string, unknown>): QuickBooksWriteLinkedTransaction[] => {
  const linkedTransactions: QuickBooksWriteLinkedTransaction[] = [];

  for (const line of toObjectArray(raw.Line)) {
    const linkedRows = toObjectArray(line.LinkedTxn);
    for (const linked of linkedRows) {
      const txnId = toNullableString(linked.TxnId);
      const txnType = toNullableString(linked.TxnType);
      if (!txnId || !txnType) {
        continue;
      }
      linkedTransactions.push({
        txnId,
        txnType,
        amount: toNumber(line.Amount)
      });
    }
  }

  return linkedTransactions;
};

const mapDetail = (
  txnType: QuickBooksWriteTxnType,
  raw: Record<string, unknown>
): QuickBooksWriteDetail => {
  const listItem = mapListItem(txnType, raw);
  if (!listItem) {
    throw new Error('quickbooks_write_transaction_not_found');
  }

  return {
    ...listItem,
    syncToken: toNullableString(raw.SyncToken),
    dueDate: txnType === 'invoice' ? toNullableString(raw.DueDate) : null,
    customerMemo: toNullableString(readNested(raw, ['CustomerMemo', 'value'])),
    customerEmail: getCustomerEmail(raw),
    depositAccountId:
      txnType === 'sales-receipt' || txnType === 'payment'
        ? refValue(raw.DepositToAccountRef)
        : null,
    depositAccountName:
      txnType === 'sales-receipt' || txnType === 'payment'
        ? refName(raw.DepositToAccountRef)
        : null,
    arAccountId: txnType === 'invoice' ? refValue(raw.ARAccountRef) : null,
    arAccountName: txnType === 'invoice' ? refName(raw.ARAccountRef) : null,
    paymentMethodId:
      txnType === 'sales-receipt' || txnType === 'payment'
        ? refValue(raw.PaymentMethodRef)
        : null,
    paymentMethodName:
      txnType === 'sales-receipt' || txnType === 'payment'
        ? refName(raw.PaymentMethodRef)
        : null,
    lines:
      txnType === 'payment'
        ? []
        : toObjectArray(raw.Line)
            .filter((line) => toNullableString(line.DetailType) === 'SalesItemLineDetail')
            .map(mapLine),
    linkedTransactions: txnType === 'payment' ? mapLinkedTransactions(raw) : [],
    raw
  };
};

const roundCurrency = (value: number) => Number(value.toFixed(2));

const mapSalesLinesForWrite = (
  lines: Extract<
    QuickBooksWriteCreateInput | QuickBooksWriteUpdateInput,
    { txnType: 'sales-receipt' | 'invoice' }
  >['lines']
) =>
  (lines ?? []).map((line) => {
    const quantity = line.quantity;
    const computedUnitPrice =
      line.unitPrice != null
        ? roundCurrency(line.unitPrice)
        : quantity
          ? roundCurrency(line.amount / quantity)
          : undefined;

    return {
      Amount: roundCurrency(line.amount),
      Description: line.description ?? '',
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        ItemRef: {
          value: line.itemId
        },
        ...(quantity != null ? { Qty: quantity } : {}),
        ...(computedUnitPrice != null ? { UnitPrice: computedUnitPrice } : {}),
        ...(line.taxCodeId ? { TaxCodeRef: { value: line.taxCodeId } } : {}),
        ...(line.serviceDate ? { ServiceDate: line.serviceDate } : {})
      }
    };
  });

const mapPaymentLinesForWrite = (linkedTransactions: QuickBooksWritePaymentLinkInput[] = []) =>
  linkedTransactions.map((linked) => ({
    Amount: roundCurrency(linked.amount),
    LinkedTxn: [
      {
        TxnId: linked.txnId,
        TxnType: linked.txnType
      }
    ]
  }));

const buildCreateBody = (input: QuickBooksWriteCreateInput): Record<string, unknown> => {
  if (input.txnType === 'sales-receipt') {
    return {
      CustomerRef: { value: input.customerId },
      TxnDate: input.txnDate,
      ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
      ...(input.memo ? { PrivateNote: input.memo } : {}),
      ...(input.customerMemo ? { CustomerMemo: { value: input.customerMemo } } : {}),
      ...(input.customerEmail ? { BillEmail: { Address: input.customerEmail } } : {}),
      ...(input.depositAccountId ? { DepositToAccountRef: { value: input.depositAccountId } } : {}),
      ...(input.paymentMethodId ? { PaymentMethodRef: { value: input.paymentMethodId } } : {}),
      Line: mapSalesLinesForWrite(input.lines)
    };
  }

  if (input.txnType === 'invoice') {
    return {
      CustomerRef: { value: input.customerId },
      TxnDate: input.txnDate,
      ...(input.dueDate ? { DueDate: input.dueDate } : {}),
      ...(input.docNumber ? { DocNumber: input.docNumber } : {}),
      ...(input.memo ? { PrivateNote: input.memo } : {}),
      ...(input.customerMemo ? { CustomerMemo: { value: input.customerMemo } } : {}),
      ...(input.customerEmail ? { BillEmail: { Address: input.customerEmail } } : {}),
      ...(input.arAccountId ? { ARAccountRef: { value: input.arAccountId } } : {}),
      Line: mapSalesLinesForWrite(input.lines)
    };
  }

  return {
    CustomerRef: { value: input.customerId },
    TxnDate: input.txnDate,
    TotalAmt: roundCurrency(input.totalAmount),
    ...(input.docNumber ? { PaymentRefNum: input.docNumber } : {}),
    ...(input.memo ? { PrivateNote: input.memo } : {}),
    ...(input.depositAccountId ? { DepositToAccountRef: { value: input.depositAccountId } } : {}),
    ...(input.paymentMethodId ? { PaymentMethodRef: { value: input.paymentMethodId } } : {}),
    ...(input.linkedTransactions.length > 0 ? { Line: mapPaymentLinesForWrite(input.linkedTransactions) } : {})
  };
};

const buildUpdateBody = (
  qbTxnId: string,
  input: QuickBooksWriteUpdateInput
): Record<string, unknown> => {
  const body: Record<string, unknown> = {
    sparse: true,
    Id: qbTxnId,
    SyncToken: input.syncToken
  };

  if (input.txnType === 'sales-receipt') {
    if (input.customerId) body.CustomerRef = { value: input.customerId };
    if (input.txnDate) body.TxnDate = input.txnDate;
    if (input.docNumber) body.DocNumber = input.docNumber;
    if (input.memo) body.PrivateNote = input.memo;
    if (input.customerMemo) body.CustomerMemo = { value: input.customerMemo };
    if (input.customerEmail) body.BillEmail = { Address: input.customerEmail };
    if (input.depositAccountId) body.DepositToAccountRef = { value: input.depositAccountId };
    if (input.paymentMethodId) body.PaymentMethodRef = { value: input.paymentMethodId };
    if (input.lines) body.Line = mapSalesLinesForWrite(input.lines);
    return body;
  }

  if (input.txnType === 'invoice') {
    if (input.customerId) body.CustomerRef = { value: input.customerId };
    if (input.txnDate) body.TxnDate = input.txnDate;
    if (input.dueDate) body.DueDate = input.dueDate;
    if (input.docNumber) body.DocNumber = input.docNumber;
    if (input.memo) body.PrivateNote = input.memo;
    if (input.customerMemo) body.CustomerMemo = { value: input.customerMemo };
    if (input.customerEmail) body.BillEmail = { Address: input.customerEmail };
    if (input.arAccountId) body.ARAccountRef = { value: input.arAccountId };
    if (input.lines) body.Line = mapSalesLinesForWrite(input.lines);
    return body;
  }

  if (input.customerId) body.CustomerRef = { value: input.customerId };
  if (input.txnDate) body.TxnDate = input.txnDate;
  if (input.totalAmount != null) body.TotalAmt = roundCurrency(input.totalAmount);
  if (input.docNumber) body.PaymentRefNum = input.docNumber;
  if (input.memo) body.PrivateNote = input.memo;
  if (input.depositAccountId) body.DepositToAccountRef = { value: input.depositAccountId };
  if (input.paymentMethodId) body.PaymentMethodRef = { value: input.paymentMethodId };
  if (input.linkedTransactions) body.Line = mapPaymentLinesForWrite(input.linkedTransactions);
  return body;
};

const parseEntityPayload = (
  txnType: QuickBooksWriteTxnType,
  payload: Record<string, unknown>
): Record<string, unknown> => {
  const raw =
    (payload[writeTxnConfig[txnType].payloadKey] as Record<string, unknown> | undefined) ?? null;
  if (!raw) {
    throw new Error('quickbooks_write_transaction_not_found');
  }
  return raw;
};

function payloadFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export const listQuickBooksWriteTransactions = async (args: {
  companyId: string;
  txnType: QuickBooksWriteTxnType;
} & QuickBooksWriteListQuery): Promise<QuickBooksWriteListResponse> => {
  const [payload, countPayload] = await Promise.all([
    runQuickBooksReadQuery(
      args.companyId,
      buildListQuery(args.txnType, {
        startDate: args.startDate,
        endDate: args.endDate,
        customerId: args.customerId,
        startPosition: 1,
        maxResults: 1000
      })
    ),
    runQuickBooksReadQuery(
      args.companyId,
      buildCountQuery(args.txnType, {
        startDate: args.startDate,
        endDate: args.endDate,
        customerId: args.customerId
      })
    )
  ]);

  let items = toObjectArray(
    (payload.QueryResponse as Record<string, unknown> | undefined)?.[
      writeTxnConfig[args.txnType].queryType
    ]
  )
    .map((row) => mapListItem(args.txnType, row))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (args.search) {
    const normalizedSearch = args.search.trim().toLowerCase();
    items = items.filter((item) =>
      [
        item.docNumber,
        item.customerName,
        item.customerId,
        item.memo,
        item.status,
        item.currencyCode
      ].some((value) => value?.toLowerCase().includes(normalizedSearch))
    );
  }

  items = sortRows(items, args.sort, {
    date: (row) => row.txnDate,
    totalAmount: (row) => row.totalAmount,
    docNumber: (row) => row.docNumber
  });

  const total = args.search ? items.length : extractQuickBooksCount(payloadFromUnknown(countPayload));
  const skip = (args.page - 1) * args.pageSize;

  return {
    ...toPageMeta(args.page, args.pageSize, total),
    txnType: args.txnType,
    items: items.slice(skip, skip + args.pageSize)
  };
};

export const getQuickBooksWriteTransactionDetail = async (args: {
  companyId: string;
  txnType: QuickBooksWriteTxnType;
  qbTxnId: string;
}): Promise<QuickBooksWriteDetail> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const payload = payloadFromUnknown(
    await requestQuickBooksApi({
      companyId: args.companyId,
      method: 'GET',
      path: `/v3/company/${secret.realmId}/${writeTxnConfig[args.txnType].path}/${args.qbTxnId}`,
      query: {
        minorversion: 75
      }
    })
  );

  return mapDetail(args.txnType, parseEntityPayload(args.txnType, payload));
};

export const createQuickBooksWriteTransaction = async (
  companyId: string,
  input: QuickBooksWriteCreateInput
): Promise<QuickBooksWriteDetail> => {
  const secret = await ensureFreshQuickBooksSecret(companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const payload = payloadFromUnknown(
    await requestQuickBooksApi({
      companyId,
      method: 'POST',
      path: `/v3/company/${secret.realmId}/${writeTxnConfig[input.txnType].path}`,
      query: {
        minorversion: 75
      },
      body: buildCreateBody(input)
    })
  );

  return mapDetail(input.txnType, parseEntityPayload(input.txnType, payload));
};

export const updateQuickBooksWriteTransaction = async (args: {
  companyId: string;
  txnType: QuickBooksWriteTxnType;
  qbTxnId: string;
  input: QuickBooksWriteUpdateInput;
}): Promise<QuickBooksWriteDetail> => {
  const secret = await ensureFreshQuickBooksSecret(args.companyId);
  if (!secret) {
    throw new Error('quickbooks_not_connected');
  }

  const payload = payloadFromUnknown(
    await requestQuickBooksApi({
      companyId: args.companyId,
      method: 'POST',
      path: `/v3/company/${secret.realmId}/${writeTxnConfig[args.txnType].path}`,
      query: {
        minorversion: 75
      },
      body: buildUpdateBody(args.qbTxnId, args.input)
    })
  );

  return mapDetail(args.txnType, parseEntityPayload(args.txnType, payload));
};
