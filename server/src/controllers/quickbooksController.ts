import { Request, Response } from 'express';
import { env } from '../config/env';
import { fail, ok } from '../utils/apiResponse';
import {
  buildQuickBooksConnectUrl,
  defaultQuickBooksReturnTo,
  disconnectQuickBooks as disconnectQuickBooksApp,
  getQuickBooksOAuthStatus as getQuickBooksOAuthStatusApp,
  getQuickBooksSettings as getQuickBooksSettingsApp,
  handleQuickBooksCallback,
  quickBooksOAuthClearCookieOptions,
  quickBooksOAuthCookieOptions,
  quickbooksOauthStateCookie,
  quickBooksReadQueryForCompany,
  quickBooksReadQuerySchema,
  queueQuickBooksSync,
  updateQuickbooksSettingsSchema,
  updateQuickBooksSettings as updateQuickBooksSettingsApp
} from '../services/quickbooks/applicationService';

const redirectWithStatus = (
  res: Response,
  returnTo: string,
  status: 'connected' | 'error',
  reason?: string
) => {
  const params = new URLSearchParams({ quickbooks: status });
  if (reason) {
    params.set('reason', reason);
  }
  return res.redirect(`${env.clientUrl}${returnTo}?${params.toString()}`);
};

export const createQuickBooksConnectUrlResponse = async (
  req: Request,
  res: Response,
  returnToPath?: string
) => {
  if (!req.user?.id || !req.user.companyId) {
    return fail(res, 'Unauthorized', 401);
  }
  try {
    const built = await buildQuickBooksConnectUrl({
      companyId: req.user.companyId,
      userId: req.user.id,
      returnToPath
    });
    res.cookie(quickbooksOauthStateCookie, built.nonce, quickBooksOAuthCookieOptions());
    return ok(res, { url: built.url, environment: built.environment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks OAuth setup failed';
    const status = message === 'Unauthorized' ? 401 : 501;
    return fail(res, message, status);
  }
};

export const getQuickBooksConnectUrl = async (req: Request, res: Response) => {
  const returnTo =
    typeof req.query.returnTo === 'string' ? req.query.returnTo : defaultQuickBooksReturnTo;
  return createQuickBooksConnectUrlResponse(req, res, returnTo);
};

export const startQuickBooksConnect = async (req: Request, res: Response) => {
  if (!req.user?.id || !req.user.companyId) {
    return fail(res, 'Unauthorized', 401);
  }
  try {
    const returnTo =
      typeof req.query.returnTo === 'string' ? req.query.returnTo : defaultQuickBooksReturnTo;
    const built = await buildQuickBooksConnectUrl({
      companyId: req.user.companyId,
      userId: req.user.id,
      returnToPath: returnTo
    });
    res.cookie(quickbooksOauthStateCookie, built.nonce, quickBooksOAuthCookieOptions());
    return res.redirect(built.url);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks OAuth setup failed';
    const status = message === 'Unauthorized' ? 401 : 501;
    return fail(res, message, status);
  }
};

export const quickBooksCallback = async (req: Request, res: Response) => {
  const nonceFromCookie = req.cookies?.[quickbooksOauthStateCookie];
  res.clearCookie(quickbooksOauthStateCookie, quickBooksOAuthClearCookieOptions());

  const result = await handleQuickBooksCallback({
    code: typeof req.query.code === 'string' ? req.query.code : '',
    state: typeof req.query.state === 'string' ? req.query.state : '',
    realmId: typeof req.query.realmId === 'string' ? req.query.realmId : '',
    callbackError: typeof req.query.error === 'string' ? req.query.error : '',
    nonceFromCookie: typeof nonceFromCookie === 'string' ? nonceFromCookie : undefined
  });

  return redirectWithStatus(res, result.returnTo, result.status, result.reason);
};

export const getQuickBooksOAuthStatus = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  return ok(res, await getQuickBooksOAuthStatusApp(req.companyId, req.user.id));
};

export const getQuickBooksSettings = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }
  return ok(res, await getQuickBooksSettingsApp(req.companyId, req.user.id));
};

export const queueQuickBooksRefreshReferenceData = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  try {
    return ok(
      res,
      await queueQuickBooksSync({
        companyId: req.companyId,
        userId: req.user.id,
        jobType: 'quickbooks.refresh_reference_data'
      })
    );
  } catch (error) {
    const message = String((error as Error).message);
    const status = message === 'QuickBooks is not connected' ? 409 : 500;
    return fail(res, status === 409 ? message : 'Failed to queue QuickBooks reference sync', status, {
      error: message
    });
  }
};

export const queueQuickBooksPostApproved = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  try {
    return ok(
      res,
      await queueQuickBooksSync({
        companyId: req.companyId,
        userId: req.user.id,
        jobType: 'quickbooks.post_approved'
      })
    );
  } catch (error) {
    const message = String((error as Error).message);
    const status = message === 'QuickBooks is not connected' ? 409 : 500;
    return fail(res, status === 409 ? message : 'Failed to queue QuickBooks post-approved sync', status, {
      error: message
    });
  }
};

export const updateQuickBooksSettings = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = updateQuickbooksSettingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  return ok(
    res,
    await updateQuickBooksSettingsApp({
      companyId: req.companyId,
      userId: req.user.id,
      environment: parsed.data.environment
    })
  );
};

export const disconnectQuickBooks = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  return ok(res, await disconnectQuickBooksApp(req.companyId, req.user.id));
};

export const quickBooksReadQuery = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = quickBooksReadQuerySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    return ok(res, await quickBooksReadQueryForCompany(req.companyId, parsed.data.query));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'QuickBooks query failed';
    const status =
      message === 'quickbooks_not_connected'
        ? 409
        : message === 'quickbooks_query_must_be_select'
          ? 422
          : 500;
    return fail(res, message, status);
  }
};
