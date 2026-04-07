import { Request, Response } from 'express';
import {
  quickBooksAccountRegisterQuerySchema,
  quickBooksHubChartOfAccountsQuerySchema,
  quickBooksHubEntitiesQuerySchema,
  quickBooksHubOperationsQuerySchema,
  quickBooksJournalAdjustmentInputSchema,
  quickBooksLiveTransactionsQuerySchema,
  quickBooksRecoverPaymentInputSchema,
  quickBooksTaxLedgerQuerySchema,
  quickBooksTaxPaymentsQuerySchema,
  quickBooksTaxReportKeySchema,
  quickBooksTransactionDetailQuerySchema,
  quickBooksTaxWindowQuerySchema,
  quickBooksWriteCreateInputSchema,
  quickBooksWriteDeleteInputSchema,
  quickBooksWriteListQuerySchema,
  quickBooksWriteTxnTypeSchema,
  quickBooksWriteUpdateInputSchema
} from '@retailsync/shared';
import {
  createQuickBooksJournalAdjustment,
  fetchQuickBooksTaxOverview,
  fetchQuickBooksTaxReport,
  getQuickBooksAccountRegister,
  getQuickBooksTransactionDetail,
  listQuickBooksHubChartOfAccounts,
  listQuickBooksHubEntities,
  listQuickBooksHubOperations,
  listQuickBooksLiveTransactions,
  listQuickBooksTaxChartOfAccounts,
  listQuickBooksTaxLedger,
  listQuickBooksTaxPayments,
  recoverQuickBooksPayment
} from '../services/quickbooksTaxService';
import {
  createQuickBooksWriteTransaction,
  deleteQuickBooksWriteTransaction,
  getQuickBooksWriteTransactionDetail,
  listQuickBooksWriteTransactions,
  updateQuickBooksWriteTransaction
} from '../services/quickbooksWriteService';
import { fail, ok } from '../utils/apiResponse';

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const getCurrentFiscalYearWindow = () => {
  const now = new Date();
  const from = `${now.getUTCFullYear()}-01-01`;
  const to = toIsoDate(now);
  return { from, to };
};

const resolveTaxWindow = (input: {
  from?: string;
  to?: string;
  basis?: 'cash' | 'accrual';
}) => {
  const fallback = getCurrentFiscalYearWindow();
  return {
    from: input.from ?? fallback.from,
    to: input.to ?? fallback.to,
    basis: input.basis ?? 'accrual'
  } as const;
};

const mapQuickBooksTaxErrorStatus = (message: string) => {
  if (message === 'quickbooks_not_connected') return 409;
  if (
    message === 'quickbooks_customer_id_required' ||
    message === 'quickbooks_vendor_payment_fields_missing' ||
    message === 'quickbooks_journal_line_invalid' ||
    message === 'quickbooks_unbalanced_journal' ||
    message === 'quickbooks_write_type_mismatch'
  ) {
    return 422;
  }
  if (
    message === 'quickbooks_write_transaction_not_found' ||
    message.startsWith('quickbooks_api_failed:404:')
  ) {
    return 404;
  }
  if (message.startsWith('quickbooks_api_failed:') || message.startsWith('quickbooks_api_fault:')) {
    return 502;
  }
  return 500;
};

const withCompanyId = (req: Request, res: Response): string | null => {
  if (!req.companyId) {
    fail(res, 'Company onboarding required', 403);
    return null;
  }
  return req.companyId;
};

export const getQuickBooksTaxOverview = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksTaxWindowQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const window = resolveTaxWindow(parsed.data);
  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.overview.request]', { companyId, ...window });
    const data = await fetchQuickBooksTaxOverview({
      companyId,
      from: window.from,
      to: window.to,
      basis: window.basis
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks tax overview failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksTaxReport = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const keyParsed = quickBooksTaxReportKeySchema.safeParse(req.params.reportKey ?? '');
  if (!keyParsed.success) {
    return fail(res, 'Invalid report key', 422, keyParsed.error.flatten());
  }

  const parsed = quickBooksTaxWindowQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  const window = resolveTaxWindow(parsed.data);

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.report.request]', {
      companyId,
      reportKey: keyParsed.data,
      ...window
    });
    const data = await fetchQuickBooksTaxReport({
      companyId,
      reportKey: keyParsed.data,
      from: window.from,
      to: window.to,
      basis: window.basis
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks tax report failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksTaxChartOfAccounts = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.chart-of-accounts.request]', { companyId });
    const data = await listQuickBooksTaxChartOfAccounts(companyId);
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks chart of accounts fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksHubChartOfAccounts = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksHubChartOfAccountsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.hub.chart-of-accounts.request]', {
      companyId,
      ...parsed.data
    });
    const data = await listQuickBooksHubChartOfAccounts({
      companyId,
      ...parsed.data
    });
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks hub chart of accounts fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksHubEntities = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksHubEntitiesQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.hub.entities.request]', {
      companyId,
      ...parsed.data
    });
    const data = await listQuickBooksHubEntities({
      companyId,
      ...parsed.data
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks hub entities fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksHubOperations = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksHubOperationsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.hub.operations.request]', {
      companyId,
      ...parsed.data
    });
    const data = await listQuickBooksHubOperations({
      companyId,
      ...parsed.data
    });
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks hub operations fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksAccountRegisterByAccount = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const accountId = typeof req.params.accountId === 'string' ? req.params.accountId.trim() : '';
  if (!accountId) {
    return fail(res, 'Validation failed', 422, {
      fieldErrors: {
        accountId: ['accountId is required']
      }
    });
  }

  const parsed = quickBooksAccountRegisterQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const window = resolveTaxWindow(parsed.data);

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.live.register.request]', {
      companyId,
      accountId,
      ...parsed.data,
      ...window
    });
    const data = await getQuickBooksAccountRegister({
      companyId,
      accountId,
      from: window.from,
      to: window.to,
      basis: window.basis,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      search: parsed.data.search,
      sort: parsed.data.sort
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks account register failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksLiveTransactionsByType = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const typeParsed = quickBooksTransactionDetailQuerySchema.safeParse({
    type: req.params.type
  });
  if (!typeParsed.success) {
    return fail(res, 'Validation failed', 422, typeParsed.error.flatten());
  }

  const parsed = quickBooksLiveTransactionsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.live.transactions.request]', {
      companyId,
      type: typeParsed.data.type,
      ...parsed.data
    });
    const data = await listQuickBooksLiveTransactions({
      companyId,
      type: typeParsed.data.type,
      ...parsed.data
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks live transactions failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksTransactionDetailById = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const qbTxnId = typeof req.params.qbTxnId === 'string' ? req.params.qbTxnId.trim() : '';
  if (!qbTxnId) {
    return fail(res, 'Validation failed', 422, {
      fieldErrors: {
        qbTxnId: ['qbTxnId is required']
      }
    });
  }

  const parsed = quickBooksTransactionDetailQuerySchema.safeParse({
    type: req.query.type
  });
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.live.transaction-detail.request]', {
      companyId,
      qbTxnId,
      type: parsed.data.type
    });
    const data = await getQuickBooksTransactionDetail({
      companyId,
      qbTxnId,
      type: parsed.data.type
    });
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks transaction detail fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksWriteTransactionsByType = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const typeParsed = quickBooksWriteTxnTypeSchema.safeParse(req.params.txnType);
  if (!typeParsed.success) {
    return fail(res, 'Validation failed', 422, typeParsed.error.flatten());
  }

  const parsed = quickBooksWriteListQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.write.list.request]', {
      companyId,
      txnType: typeParsed.data,
      ...parsed.data
    });
    const data = await listQuickBooksWriteTransactions({
      companyId,
      txnType: typeParsed.data,
      ...parsed.data
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks write list failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksWriteTransactionDetailById = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const typeParsed = quickBooksWriteTxnTypeSchema.safeParse(req.params.txnType);
  if (!typeParsed.success) {
    return fail(res, 'Validation failed', 422, typeParsed.error.flatten());
  }

  const qbTxnId = typeof req.params.qbTxnId === 'string' ? req.params.qbTxnId.trim() : '';
  if (!qbTxnId) {
    return fail(res, 'Validation failed', 422, {
      fieldErrors: {
        qbTxnId: ['qbTxnId is required']
      }
    });
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.write.detail.request]', {
      companyId,
      txnType: typeParsed.data,
      qbTxnId
    });
    const data = await getQuickBooksWriteTransactionDetail({
      companyId,
      txnType: typeParsed.data,
      qbTxnId
    });
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks write transaction fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const postQuickBooksWriteTransaction = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const typeParsed = quickBooksWriteTxnTypeSchema.safeParse(req.params.txnType);
  if (!typeParsed.success) {
    return fail(res, 'Validation failed', 422, typeParsed.error.flatten());
  }

  const parsed = quickBooksWriteCreateInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (parsed.data.txnType !== typeParsed.data) {
    return fail(res, 'quickbooks_write_type_mismatch', 422);
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.write.create.request]', {
      companyId,
      txnType: parsed.data.txnType
    });
    const data = await createQuickBooksWriteTransaction(companyId, parsed.data);
    return ok(res, data, 201);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks write transaction create failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const patchQuickBooksWriteTransaction = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const typeParsed = quickBooksWriteTxnTypeSchema.safeParse(req.params.txnType);
  if (!typeParsed.success) {
    return fail(res, 'Validation failed', 422, typeParsed.error.flatten());
  }

  const qbTxnId = typeof req.params.qbTxnId === 'string' ? req.params.qbTxnId.trim() : '';
  if (!qbTxnId) {
    return fail(res, 'Validation failed', 422, {
      fieldErrors: {
        qbTxnId: ['qbTxnId is required']
      }
    });
  }

  const parsed = quickBooksWriteUpdateInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (parsed.data.txnType !== typeParsed.data) {
    return fail(res, 'quickbooks_write_type_mismatch', 422);
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.write.update.request]', {
      companyId,
      txnType: parsed.data.txnType,
      qbTxnId
    });
    const data = await updateQuickBooksWriteTransaction({
      companyId,
      txnType: parsed.data.txnType,
      qbTxnId,
      input: parsed.data
    });
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks write transaction update failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const deleteQuickBooksWriteTransactionById = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const typeParsed = quickBooksWriteTxnTypeSchema.safeParse(req.params.txnType);
  if (!typeParsed.success) {
    return fail(res, 'Validation failed', 422, typeParsed.error.flatten());
  }

  const qbTxnId = typeof req.params.qbTxnId === 'string' ? req.params.qbTxnId.trim() : '';
  if (!qbTxnId) {
    return fail(res, 'Validation failed', 422, {
      fieldErrors: {
        qbTxnId: ['qbTxnId is required']
      }
    });
  }

  const parsed = quickBooksWriteDeleteInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (parsed.data.txnType !== typeParsed.data) {
    return fail(res, 'quickbooks_write_type_mismatch', 422);
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.write.delete.request]', {
      companyId,
      txnType: parsed.data.txnType,
      qbTxnId
    });
    const data = await deleteQuickBooksWriteTransaction({
      companyId,
      txnType: parsed.data.txnType,
      qbTxnId,
      syncToken: parsed.data.syncToken
    });
    return ok(res, data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'QuickBooks write transaction delete failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksTaxLedger = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksTaxLedgerQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  const window = resolveTaxWindow(parsed.data);

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.ledger.request]', { companyId, ...parsed.data, ...window });
    const data = await listQuickBooksTaxLedger({
      companyId,
      from: window.from,
      to: window.to,
      basis: window.basis,
      accountId: parsed.data.accountId,
      limit: parsed.data.limit ?? 100,
      cursor: parsed.data.cursor
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks ledger fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const getQuickBooksTaxPayments = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksTaxPaymentsQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  const window = resolveTaxWindow(parsed.data);

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.payments.request]', { companyId, ...parsed.data, ...window });
    const data = await listQuickBooksTaxPayments({
      companyId,
      from: window.from,
      to: window.to,
      type: parsed.data.type ?? 'all',
      limit: parsed.data.limit ?? 100,
      cursor: parsed.data.cursor
    });
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks payments fetch failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const postQuickBooksRecoverPayment = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksRecoverPaymentInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.recover-payment.request]', {
      companyId,
      paymentType: parsed.data.paymentType,
      clientRequestId: parsed.data.clientRequestId
    });
    const data = await recoverQuickBooksPayment(companyId, parsed.data);
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks payment recovery failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};

export const postQuickBooksJournalAdjustment = async (req: Request, res: Response) => {
  const companyId = withCompanyId(req, res);
  if (!companyId) return;

  const parsed = quickBooksJournalAdjustmentInputSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    // eslint-disable-next-line no-console
    console.info('[quickbooks.tax.journal-adjustment.request]', {
      companyId,
      clientRequestId: parsed.data.clientRequestId,
      lineCount: parsed.data.lines.length
    });
    const data = await createQuickBooksJournalAdjustment(companyId, parsed.data);
    return ok(res, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks journal adjustment failed';
    return fail(res, message, mapQuickBooksTaxErrorStatus(message));
  }
};
