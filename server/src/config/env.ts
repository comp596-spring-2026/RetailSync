import dotenv from "dotenv";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SERVER_RUNTIME_DEFAULTS } from "../constants/config";

const parseBooleanFlag = (...values: Array<string | undefined>) =>
  values.some((value) => {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  });

const TEST_ENCRYPTION_KEY = Buffer.from("12345678901234567890123456789012").toString("base64");

const isValidEncryptionKey = (value: string | undefined) => {
  if (!value) return false;
  try {
    return Buffer.from(value, "base64").length === 32;
  } catch {
    return false;
  }
};

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

for (const path of envCandidates) {
  if (existsSync(path)) {
    dotenv.config({ path, override: false });
    break;
  }
}

const isTestRuntime =
  process.env.NODE_ENV === "test" ||
  parseBooleanFlag(process.env.VITEST) ||
  process.argv.some((arg) => arg.includes("vitest"));

if (isTestRuntime) {
  process.env.PORT = process.env.PORT ?? String(SERVER_RUNTIME_DEFAULTS.port);
  process.env.MONGO_URI = process.env.MONGO_URI ?? SERVER_RUNTIME_DEFAULTS.testMongoUri;
  process.env.CLIENT_URL = process.env.CLIENT_URL ?? SERVER_RUNTIME_DEFAULTS.testClientUrl;
  if (!isValidEncryptionKey(process.env.ENCRYPTION_KEY)) {
    process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
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
  port: Number(process.env.PORT ?? SERVER_RUNTIME_DEFAULTS.port),
  mongoUri: process.env.MONGO_URI as string,
  accessSecret: deriveSecret(encryptionKeyBuffer, "jwt-access"),
  refreshSecret: deriveSecret(encryptionKeyBuffer, "jwt-refresh"),
  clientUrl: process.env.CLIENT_URL as string,
  nodeEnv: process.env.NODE_ENV ?? SERVER_RUNTIME_DEFAULTS.nodeEnv,
  encryptionKey: process.env.ENCRYPTION_KEY as string,
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  googleAuthRedirectUri: process.env.GOOGLE_AUTH_REDIRECT_URI,
  googleIntegrationRedirectUri: process.env.GOOGLE_INTEGRATION_REDIRECT_URI,
  quickbooksClientId: process.env.QUICKBOOKS_CLIENT_ID,
  quickbooksClientSecret: process.env.QUICKBOOKS_CLIENT_SECRET,
  quickbooksIntegrationRedirectUri: process.env.QUICKBOOKS_INTEGRATION_REDIRECT_URI,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  smtpSecure: parseBooleanFlag(process.env.SMTP_SECURE),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpFrom: process.env.SMTP_FROM,
  smtpFromName: process.env.SMTP_FROM_NAME ?? SERVER_RUNTIME_DEFAULTS.smtpFromName,
  smtpTimeoutMs: Number(process.env.SMTP_TIMEOUT_MS ?? SERVER_RUNTIME_DEFAULTS.smtpTimeoutMs),
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  serviceSecret: process.env.ENCRYPTION_KEY as string,
  gcsBucketName: process.env.GCS_BUCKET_NAME,
  tasksMode: process.env.TASKS_MODE === 'cloud' ? 'cloud' : 'inline',
  internalTasksEndpoint: process.env.INTERNAL_TASKS_ENDPOINT,
  gcpProjectId: process.env.GCP_PROJECT_ID,
  gcpRegion: process.env.GCP_REGION ?? SERVER_RUNTIME_DEFAULTS.gcpRegion,
  tasksQueuePipeline: process.env.TASKS_QUEUE_PIPELINE ?? SERVER_RUNTIME_DEFAULTS.tasksQueuePipeline,
  tasksQueueSync: process.env.TASKS_QUEUE_SYNC ?? SERVER_RUNTIME_DEFAULTS.tasksQueueSync,
  tasksOidcServiceAccountEmail: process.env.TASKS_OIDC_SERVICE_ACCOUNT_EMAIL,
  apiServiceName: process.env.API_SERVICE_NAME,
  statementPdfRenderCommand: process.env.STATEMENT_PDF_RENDER_COMMAND ?? SERVER_RUNTIME_DEFAULTS.statementPdfRenderCommand,
  statementPdfRenderDpi: Number(process.env.STATEMENT_PDF_RENDER_DPI ?? SERVER_RUNTIME_DEFAULTS.statementPdfRenderDpi),
  statementPdfRenderTimeoutMs: Number(process.env.STATEMENT_PDF_RENDER_TIMEOUT_MS ?? SERVER_RUNTIME_DEFAULTS.statementTimeoutMs),
  statementOcrProvider: process.env.STATEMENT_OCR_PROVIDER ?? SERVER_RUNTIME_DEFAULTS.statementOcrProvider,
  statementOcrVisionEndpoint:
    process.env.STATEMENT_OCR_VISION_ENDPOINT ?? SERVER_RUNTIME_DEFAULTS.statementOcrVisionEndpoint,
  statementOcrTimeoutMs: Number(process.env.STATEMENT_OCR_TIMEOUT_MS ?? SERVER_RUNTIME_DEFAULTS.statementTimeoutMs),
  statementCheckRegionMarginPx: Number(process.env.STATEMENT_CHECK_REGION_MARGIN_PX ?? SERVER_RUNTIME_DEFAULTS.statementCheckRegionMarginPx),
  statementCheckRegionMinScore: Number(process.env.STATEMENT_CHECK_REGION_MIN_SCORE ?? SERVER_RUNTIME_DEFAULTS.statementCheckRegionMinScore),
  statementCheckRegionMaxCandidates: Number(process.env.STATEMENT_CHECK_REGION_MAX_CANDIDATES ?? SERVER_RUNTIME_DEFAULTS.statementCheckRegionMaxCandidates),
  statementGeminiEndpoint: process.env.STATEMENT_GEMINI_ENDPOINT ?? SERVER_RUNTIME_DEFAULTS.statementGeminiEndpoint,
  statementGeminiModel: process.env.STATEMENT_GEMINI_MODEL ?? SERVER_RUNTIME_DEFAULTS.statementGeminiModel,
  statementGeminiApiKey: process.env.STATEMENT_GEMINI_API_KEY,
  statementGeminiTimeoutMs: Number(process.env.STATEMENT_GEMINI_TIMEOUT_MS ?? SERVER_RUNTIME_DEFAULTS.statementTimeoutMs),
  statementGeminiTemperature: Number(process.env.STATEMENT_GEMINI_TEMPERATURE ?? SERVER_RUNTIME_DEFAULTS.statementGeminiTemperature),
  statementGeminiMaxOutputTokens: Number(process.env.STATEMENT_GEMINI_MAX_OUTPUT_TOKENS ?? SERVER_RUNTIME_DEFAULTS.statementGeminiMaxOutputTokens),
  statementGeminiMinConfidence: Number(process.env.STATEMENT_GEMINI_MIN_CONFIDENCE ?? SERVER_RUNTIME_DEFAULTS.statementGeminiMinConfidence),
  debugVerboseApi: parseBooleanFlag(process.env.DEBUG_VERBOSE_API, process.env.DEBUG),
};
