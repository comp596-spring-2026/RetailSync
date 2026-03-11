import {
  createQuickBooksCheckTransaction,
  createQuickBooksJournalEntry,
  ensureFreshQuickBooksSecret,
  listQuickBooksAccounts,
  requestQuickBooksApi,
  runQuickBooksReadQuery
} from './quickbooksService';

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
    fetchQuickBooksTaxReport({
      companyId: args.companyId,
      reportKey: 'ar-aging',
      from: args.from,
      to: args.to,
      basis: args.basis
    }),
    fetchQuickBooksTaxReport({
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
      arOpen: findLastAmountByLabel(arAging.rows, ['total']),
      apOpen: findLastAmountByLabel(apAging.rows, ['total'])
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
