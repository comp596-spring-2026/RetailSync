import { Request, Response } from "express";
import { fail, ok } from "../../utils/apiResponse";
import {
  getGoogleSheetsSyncOverview as getGoogleSheetsSyncOverviewApp,
  getSettingsPayload,
} from "../../services/googleSheets/settingsService";
import {
  toGoogleSheetsErrorDetails,
  toGoogleSheetsErrorMessage,
  toGoogleSheetsErrorStatus,
} from "../../services/googleSheets/errors";

export const getSettings = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    return fail(res, "Company onboarding required", 403);
  }

  try {
    return ok(res, await getSettingsPayload(companyId, userId));
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to load settings"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const getGoogleSheetsSyncOverview = async (req: Request, res: Response) => {
  const companyId = req.user?.companyId;
  if (!companyId) {
    return fail(res, "Company onboarding required", 403);
  }
  try {
    return ok(res, await getGoogleSheetsSyncOverviewApp(companyId));
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to load sync overview"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};
