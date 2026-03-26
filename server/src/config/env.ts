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
  process.env.PORT = process.env.PORT ?? "4000";
  process.env.MONGO_URI = process.env.MONGO_URI ?? "mongodb://127.0.0.1:27017/retailsync-test";
  process.env.CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:5173";
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
  statementPdfRenderCommand: process.env.STATEMENT_PDF_RENDER_COMMAND ?? 'pdftoppm',
  statementPdfRenderDpi: Number(process.env.STATEMENT_PDF_RENDER_DPI ?? 144),
  statementPdfRenderTimeoutMs: Number(process.env.STATEMENT_PDF_RENDER_TIMEOUT_MS ?? 120000),
  statementOcrProvider: process.env.STATEMENT_OCR_PROVIDER ?? 'vision',
  statementOcrVisionEndpoint:
    process.env.STATEMENT_OCR_VISION_ENDPOINT ?? 'https://vision.googleapis.com/v1/images:annotate',
  statementOcrTimeoutMs: Number(process.env.STATEMENT_OCR_TIMEOUT_MS ?? 120000),
  statementCheckRegionMarginPx: Number(process.env.STATEMENT_CHECK_REGION_MARGIN_PX ?? 24),
  statementCheckRegionMinScore: Number(process.env.STATEMENT_CHECK_REGION_MIN_SCORE ?? 0.55),
  statementCheckRegionMaxCandidates: Number(process.env.STATEMENT_CHECK_REGION_MAX_CANDIDATES ?? 8),
  statementGeminiEndpoint: process.env.STATEMENT_GEMINI_ENDPOINT ?? 'https://generativelanguage.googleapis.com/v1beta/models',
  statementGeminiModel: process.env.STATEMENT_GEMINI_MODEL ?? 'gemini-2.5-flash',
  statementGeminiApiKey: process.env.STATEMENT_GEMINI_API_KEY,
  statementGeminiTimeoutMs: Number(process.env.STATEMENT_GEMINI_TIMEOUT_MS ?? 120000),
  statementGeminiTemperature: Number(process.env.STATEMENT_GEMINI_TEMPERATURE ?? 0.2),
  statementGeminiMaxOutputTokens: Number(process.env.STATEMENT_GEMINI_MAX_OUTPUT_TOKENS ?? 1024),
  statementGeminiMinConfidence: Number(process.env.STATEMENT_GEMINI_MIN_CONFIDENCE ?? 0.65),
  debugVerboseApi: parseBooleanFlag(process.env.DEBUG_VERBOSE_API, process.env.DEBUG),
};
