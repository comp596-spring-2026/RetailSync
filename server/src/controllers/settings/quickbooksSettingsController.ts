import { Request, Response } from "express";
import { fail, ok } from "../../utils/apiResponse";
import {
  buildQuickBooksConnectUrl,
  disconnectLegacyQuickBooksSettings,
  quickBooksOAuthCookieOptions,
  quickbooksOauthStateCookie,
  settingsQuickBooksMutationSchema,
  updateLegacyQuickBooksSettings,
} from "../../services/quickbooks/applicationService";

export const setQuickBooksSettings = async (req: Request, res: Response) => {
  const parsed = settingsQuickBooksMutationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.path[0];
    return fail(
      res,
      firstIssue === "connected"
        ? "connected must be boolean"
        : "environment must be sandbox or production",
      400,
    );
  }

  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) {
      return fail(res, "Company onboarding required", 403);
    }
    return ok(
      res,
      await updateLegacyQuickBooksSettings({
        companyId,
        userId,
        environment: parsed.data.environment,
        connected: parsed.data.connected,
        realmId: parsed.data.realmId,
        companyName: parsed.data.companyName,
      }),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update QuickBooks settings";
    return fail(res, message, 400);
  }
};

export const disconnectQuickBooks = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }

  try {
    const userId = req.user?.id;
    if (!userId) {
      return fail(res, "Company onboarding required", 403);
    }
    return ok(res, await disconnectLegacyQuickBooksSettings(companyId, userId));
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to disconnect QuickBooks";
    return fail(res, message, 400);
  }
};

export const connectQuickBooks = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, "Unauthorized", 401);
  }
  const returnTo =
    typeof req.body?.returnTo === "string"
      ? req.body.returnTo
      : "/dashboard/settings";
  try {
    const built = await buildQuickBooksConnectUrl({
      companyId,
      userId,
      returnToPath: returnTo,
    });
    res.cookie(
      quickbooksOauthStateCookie,
      built.nonce,
      quickBooksOAuthCookieOptions(),
    );
    return ok(res, { url: built.url, environment: built.environment });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "QuickBooks OAuth setup failed";
    const status = message === "Unauthorized" ? 401 : 501;
    return fail(res, message, status);
  }
};
