import { Request, Response } from 'express';
import {
  quickBooksJournalAdjustmentInputSchema,
  quickBooksRecoverPaymentInputSchema,
  quickBooksTaxLedgerQuerySchema,
  quickBooksTaxPaymentsQuerySchema,
  quickBooksTaxReportKeySchema,
  quickBooksTaxWindowQuerySchema
} from '@retailsync/shared';
import {
  createQuickBooksJournalAdjustment,
  fetchQuickBooksTaxOverview,
  fetchQuickBooksTaxReport,
  listQuickBooksTaxChartOfAccounts,
  listQuickBooksTaxLedger,
  listQuickBooksTaxPayments,
  recoverQuickBooksPayment
} from '../services/quickbooksTaxService';
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
    message === 'quickbooks_unbalanced_journal'
  ) {
    return 422;
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
