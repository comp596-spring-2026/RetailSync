import {
  APP_EMAIL_FROM_NAME,
  DEV_CLIENT_ORIGIN,
  DEV_VITE_CLIENT_ORIGIN,
  SMTP_DEFAULTS
} from '@retailsync/shared';

export const SERVER_RUNTIME_DEFAULTS = {
  port: 4000,
  nodeEnv: 'development',
  testMongoUri: 'mongodb://127.0.0.1:27017/retailsync-test',
  testClientUrl: DEV_VITE_CLIENT_ORIGIN,
  smtpFromName: APP_EMAIL_FROM_NAME,
  smtpTimeoutMs: SMTP_DEFAULTS.timeoutMs,
  gcpRegion: 'us-west1',
  tasksQueuePipeline: 'pipeline-ocr-dev',
  tasksQueueSync: 'sync-integrations-dev',
  statementTimeoutMs: 120000,
  statementOcrProvider: 'offline',
  statementOcrVisionEndpoint: 'https://vision.googleapis.com/v1/images:annotate',
  statementCheckRegionMarginPx: 24,
  statementCheckRegionMinScore: 0.55,
  statementCheckRegionMaxCandidates: 8,
  statementGeminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
  statementGeminiModel: 'gemini-2.5-flash',
  statementGeminiTemperature: 0.2,
  statementGeminiMaxOutputTokens: 1024,
  statementGeminiMinConfidence: 0.65
} as const;

export const AUTH_SESSION_DEFAULTS = {
  refreshTokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  googleOAuthStateTtlMs: 10 * 60 * 1000,
  inviteAcceptanceTtlMs: 24 * 60 * 60 * 1000,
  verificationTokenTtlMs: 30 * 60 * 1000,
  passwordResetTokenTtlMs: 60 * 60 * 1000
} as const;

export const AUTH_COOKIE_NAMES = {
  refreshToken: 'refreshToken',
  googleOAuthState: 'googleOAuthState'
} as const;

export const TEST_ENV_DEFAULTS = {
  smtpHost: '127.0.0.1',
  smtpPort: '2525',
  smtpSecure: 'false',
  smtpFrom: 'no-reply@retailsync.test'
} as const;

export const DEPLOY_QUEUE_DEFAULTS = {
  maxAttempts: 8,
  maxRetryDuration: '3600s',
  minBackoff: '5s',
  maxBackoff: '120s'
} as const;

export const STORAGE_SCRIPT_DEFAULTS = {
  localOrigins: [
    DEV_CLIENT_ORIGIN,
    DEV_VITE_CLIENT_ORIGIN,
    'http://localhost:5174',
    'http://localhost:8080'
  ],
  maxAgeSeconds: 3600
} as const;
