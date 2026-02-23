import { randomBytes } from "node:crypto";
import { Request, Response } from "express";
import { env } from "../config/env";
import { IntegrationSecretModel } from "../models/IntegrationSecret";
import { IntegrationSettingsModel } from "../models/IntegrationSettings";
import { encryptJson } from "../utils/encryption";
import { fail, ok } from "../utils/apiResponse";
import { google } from "googleapis";
const SERVICE_ACCOUNT_EMAIL =
  "retialsync@lively-infinity-488304-m9.iam.gserviceaccount.com";

const getOAuthClient = () => {
  if (
    !env.googleOAuthClientId ||
    !env.googleOAuthClientSecret ||
    !env.googleOAuthRedirectUri
  ) {
    return null;
  }

  return new google.auth.OAuth2(
    env.googleOAuthClientId,
    env.googleOAuthClientSecret,
    env.googleOAuthRedirectUri,
  );
};

export const connectGoogle = async (req: Request, res: Response) => {
  if (!req.user?.id || !req.user.companyId) {
    return fail(res, "Unauthorized", 401);
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return fail(
      res,
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
      501,
    );
  }

  const statePayload = {
    nonce: randomBytes(12).toString("hex"),
    userId: req.user.id,
    companyId: req.user.companyId,
  };

  const state = Buffer.from(JSON.stringify(statePayload), "utf-8").toString("base64url");
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    state,
  });

  return res.redirect(url);
};

export const connectGoogleUrl = async (req: Request, res: Response) => {
  if (!req.user?.id || !req.user.companyId) {
    return fail(res, "Unauthorized", 401);
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return fail(
      res,
      "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.",
      501,
    );
  }

  const statePayload = {
    nonce: randomBytes(12).toString("hex"),
    userId: req.user.id,
    companyId: req.user.companyId,
  };

  const state = Buffer.from(JSON.stringify(statePayload), "utf-8").toString("base64url");
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    state,
  });

  return ok(res, { url });
};

export const googleCallback = async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    return fail(res, "Missing OAuth callback params", 400);
  }

  const oauthClient = getOAuthClient();
  if (!oauthClient) {
    return fail(res, "Google OAuth is not configured on server", 501);
  }

  let parsedState: { userId: string; companyId: string };
  try {
    parsedState = JSON.parse(
      Buffer.from(state, "base64url").toString("utf-8"),
    ) as {
      userId: string;
      companyId: string;
    };
  } catch {
    return fail(res, "Invalid OAuth state", 400);
  }

  try {
    const tokenRes = await oauthClient.getToken(code);
    const tokens = tokenRes.tokens;

    if (!tokens.access_token) {
      return fail(
        res,
        "Google token exchange did not return access token",
        400,
      );
    }

    await IntegrationSecretModel.findOneAndUpdate(
      { companyId: parsedState.companyId, provider: "google_oauth" },
      {
        $set: {
          encryptedPayload: encryptJson(
            {
              accessToken: tokens.access_token,
              refreshToken: tokens.refresh_token,
              expiryDate: tokens.expiry_date,
              scope: tokens.scope,
              tokenType: tokens.token_type,
            },
            env.encryptionKey,
          ),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await IntegrationSettingsModel.findOneAndUpdate(
      { companyId: parsedState.companyId },
      {
        $set: {
          ownerUserId: parsedState.userId,
          "googleSheets.connected": true,
          "googleSheets.updatedAt": new Date(),
        },
        $setOnInsert: {
          "googleSheets.mode": "oauth",
          "googleSheets.serviceAccountEmail": SERVICE_ACCOUNT_EMAIL,
          "googleSheets.sources": [],
          "quickbooks.connected": false,
          "quickbooks.environment": "sandbox",
          "quickbooks.realmId": null,
          "quickbooks.companyName": null,
          "quickbooks.updatedAt": new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return ok(res, {
      connected: true,
      message:
        "Google account connected. Return to POS Import modal and fetch sheet data.",
    });
  } catch (error) {
    console.error(error);
    return fail(res, "Google OAuth callback failed", 500);
  }
};
