import { Request, Response } from "express";
import { fail, ok } from "../utils/apiResponse";
import {
  activateGoogleSheets as activateGoogleSheetsApp,
  activateSchema,
  commitChangeSchema,
  commitGoogleSheetsChange as commitGoogleSheetsChangeApp,
  createOAuthSource as createOAuthSourceApp,
  createOAuthSourceSchema,
  createSharedProfile as createSharedProfileApp,
  createSharedProfileSchema,
  debugOAuthConnector as debugOAuthConnectorApp,
  debugOAuthSchema,
  debugSharedConnector as debugSharedConnectorApp,
  debugSharedSchema,
  getGoogleSheetsSettingsView,
  listOAuthSources as listOAuthSourcesApp,
  listSharedProfiles as listSharedProfilesApp,
  markConnectorImported,
  stageChangeSchema,
  stageGoogleSheetsChange as stageGoogleSheetsChangeApp,
  updateOAuthConnector as updateOAuthConnectorApp,
  updateSharedConnector as updateSharedConnectorApp,
  connectorPatchSchema,
} from "../services/googleSheets/managementService";
import {
  toGoogleSheetsErrorDetails,
  toGoogleSheetsErrorMessage,
  toGoogleSheetsErrorStatus,
} from "../services/googleSheets/errors";

const getContext = (req: Request, res: Response) => {
  const companyId = req.companyId;
  const userId = req.user?.id;
  if (!companyId || !userId) {
    fail(res, "Company onboarding required", 403);
    return null;
  }
  return { companyId, userId };
};

export const getSettings = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  try {
    return ok(
      res,
      await getGoogleSheetsSettingsView(context.companyId, context.userId),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to load Google Sheets settings"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const activateGoogleSheets = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = activateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await activateGoogleSheetsApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to activate connector"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const createOAuthSource = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = createOAuthSourceSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await createOAuthSourceApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to create OAuth source"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const updateOAuthConnector = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const sourceId = String(req.params.sourceId ?? "").trim();
  const connectorKey = String(req.params.connectorKey ?? "").trim();
  if (!sourceId || !connectorKey) {
    return fail(res, "sourceId and connectorKey are required", 400);
  }

  const parsed = connectorPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await updateOAuthConnectorApp({
        ...context,
        sourceId,
        connectorKey,
        input: parsed.data,
      }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to update OAuth connector"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const listOAuthSources = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  try {
    return ok(res, await listOAuthSourcesApp(context.companyId, context.userId));
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to list OAuth sources"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const createSharedProfile = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = createSharedProfileSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await createSharedProfileApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to create shared profile"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const updateSharedConnector = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const profileId = String(req.params.profileId ?? "").trim();
  const connectorKey = String(req.params.connectorKey ?? "").trim();
  if (!profileId || !connectorKey) {
    return fail(res, "profileId and connectorKey are required", 400);
  }

  const parsed = connectorPatchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await updateSharedConnectorApp({
        ...context,
        profileId,
        connectorKey,
        input: parsed.data,
      }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to update shared connector"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const listSharedProfiles = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  try {
    return ok(
      res,
      await listSharedProfilesApp(context.companyId, context.userId),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to list shared profiles"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const stageGoogleSheetsChange = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = stageChangeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await stageGoogleSheetsChangeApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to stage Google Sheets change"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const commitGoogleSheetsChange = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = commitChangeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await commitGoogleSheetsChangeApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Failed to commit Google Sheets change"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const debugOAuthConnector = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = debugOAuthSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await debugOAuthConnectorApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "OAuth debug failed"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export const debugSharedConnector = async (req: Request, res: Response) => {
  const context = getContext(req, res);
  if (!context) return;

  const parsed = debugSharedSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, "Validation failed", 422, parsed.error.flatten());
  }

  try {
    return ok(
      res,
      await debugSharedConnectorApp({ ...context, input: parsed.data }),
    );
  } catch (error) {
    return fail(
      res,
      toGoogleSheetsErrorMessage(error, "Shared debug failed"),
      toGoogleSheetsErrorStatus(error),
      toGoogleSheetsErrorDetails(error),
    );
  }
};

export { markConnectorImported };
