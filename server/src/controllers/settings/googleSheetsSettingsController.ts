import { Request, Response } from "express";
import { fail, ok } from "../../utils/apiResponse";
import {
  disconnectGoogle as disconnectGoogleApp,
  googleSheetsModeSchema,
  resetGoogleSheetsIntegration as resetGoogleSheetsIntegrationApp,
  setGoogleMode as setGoogleModeApp,
  testGoogleSheetAccess as testGoogleSheetAccessApp,
  testGoogleSheetAccessSchema,
  upsertGoogleSource as upsertGoogleSourceApp,
  upsertGoogleSourceSchema,
} from "../../services/googleSheets/settingsService";
import {
  toGoogleSheetsErrorDetails,
  toGoogleSheetsErrorMessage,
  toGoogleSheetsErrorStatus,
} from "../../services/googleSheets/errors";

const getContext = (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    fail(res, "Company onboarding required", 403);
    return null;
  }
  return { companyId, userId };
};

export const setGoogleMode = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = googleSheetsModeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "mode must be service_account or oauth", 400);
  }

  try {
    return ok(
      res,
      await setGoogleModeApp({ ...context, mode: parsed.data.mode }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to update google mode"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const upsertGoogleSource = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = upsertGoogleSourceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.path[0];
    const message =
      firstIssue === "spreadsheetId"
        ? "spreadsheetId is required"
        : firstIssue === "range"
          ? "range is required"
          : "name is required";
    return fail(res, message, 400);
  }

  try {
    return ok(
      res,
      await upsertGoogleSourceApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to save Google source"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const testGoogleSheetAccess = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = testGoogleSheetAccessSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.path[0];
    return fail(
      res,
      firstIssue === "range" ? "range is required" : "spreadsheetId is required",
      400,
    );
  }

  try {
    return ok(
      res,
      await testGoogleSheetAccessApp({
        companyId: context.companyId,
        input: parsed.data,
      }),
    );
  } catch (error) {
    const message = toGoogleSheetsErrorMessage(
      error,
      "Google Sheets access check failed",
    );
    const statusCode =
      /permission|forbidden|insufficient|not found|access/i.test(message)
        ? 403
        : toGoogleSheetsErrorStatus(error, 500);
    return fail(res, message, statusCode, toGoogleSheetsErrorDetails(error));
  }
};

export const disconnectGoogle = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  try {
    return ok(
      res,
      await disconnectGoogleApp(context.companyId, context.userId),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to disconnect Google"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const resetGoogleSheetsIntegration = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  try {
    return ok(
      res,
      await resetGoogleSheetsIntegrationApp(context.companyId, context.userId),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to reset Google Sheets integration"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};
