import dotenv from "dotenv";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const parseBooleanFlag = (...values: Array<string | undefined>) =>
  values.some((value) => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  });

const getEncryptionKeyBuffer = (value: string | undefined) => {
  if (!value) {
    throw new Error("Missing env var: ENCRYPTION_KEY");
  }

  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be base64-encoded 32-byte key");
  }

  return key;
};

const deriveSecret = (masterKey: Buffer, purpose: string) =>
  createHmac("sha256", masterKey).update(`retailsync:${purpose}`).digest("base64url");

const envCandidates = [
  resolve(process.cwd(), "server/.env"),
  resolve(process.cwd(), ".env"),
];

const exampleCandidates = [
  resolve(process.cwd(), "server/.env.example"),
  resolve(process.cwd(), ".env.example"),
];

for (const path of envCandidates) {
  if (existsSync(path)) {
    dotenv.config({ path, override: false });
    break;
  }
}

for (const path of exampleCandidates) {
  if (existsSync(path)) {
    dotenv.config({ path, override: false });
    break;
  }
}

const required = [
  "PORT",
  "MONGO_URI",
  "ENCRYPTION_KEY",
  "CLIENT_URL",
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

const encryptionKeyBuffer = getEncryptionKeyBuffer(process.env.ENCRYPTION_KEY);

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI as string,
  accessSecret: deriveSecret(encryptionKeyBuffer, "jwt-access"),
  refreshSecret: deriveSecret(encryptionKeyBuffer, "jwt-refresh"),
  clientUrl: process.env.CLIENT_URL as string,
  nodeEnv: process.env.NODE_ENV ?? "development",
  encryptionKey: process.env.ENCRYPTION_KEY as string,
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  googleAuthRedirectUri: process.env.GOOGLE_AUTH_REDIRECT_URI,
  googleIntegrationRedirectUri: process.env.GOOGLE_INTEGRATION_REDIRECT_URI,
  quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID,
  quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  quickbooksIntegrationRedirectUri: process.env.QUICKBOOKS_INTEGRATION_REDIRECT_URI,
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  serviceSecret: process.env.ENCRYPTION_KEY as string,
  gcsBucketName: process.env.GCS_BUCKET_NAME,
  tasksMode: process.env.TASKS_MODE === 'cloud' ? 'cloud' : 'inline',
  internalTasksEndpoint: process.env.INTERNAL_TASKS_ENDPOINT,
  gcpProjectId: process.env.GCP_PROJECT_ID,
  gcpRegion: process.env.GCP_REGION ?? 'us-west1',
  tasksQueuePipeline: process.env.TASKS_QUEUE_PIPELINE ?? 'pipeline-ocr-dev',
  tasksQueueSync: process.env.TASKS_QUEUE_SYNC ?? 'sync-integrations-dev',
  tasksOidcServiceAccountEmail: process.env.TASKS_OIDC_SERVICE_ACCOUNT_EMAIL,
  apiServiceName: process.env.API_SERVICE_NAME,
  debugVerboseApi: parseBooleanFlag(process.env.DEBUG_VERBOSE_API, process.env.DEBUG),
};
