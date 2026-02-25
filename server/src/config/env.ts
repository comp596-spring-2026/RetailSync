import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envCandidates = [
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env')
];

const exampleCandidates = [
  resolve(process.cwd(), 'server/.env.example'),
  resolve(process.cwd(), '.env.example')
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
  'PORT',
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CLIENT_URL'
] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing env var: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGO_URI as string,
  accessSecret: process.env.JWT_ACCESS_SECRET as string,
  refreshSecret: process.env.JWT_REFRESH_SECRET as string,
  clientUrl: process.env.CLIENT_URL as string,
  nodeEnv: process.env.NODE_ENV ?? 'development',
  encryptionKey: process.env.ENCRYPTION_KEY,
  googleServiceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  googleAuthRedirectUri: process.env.GOOGLE_AUTH_REDIRECT_URI,
  googleIntegrationRedirectUri:
    process.env.GOOGLE_INTEGRATION_REDIRECT_URI ?? process.env.GOOGLE_AUTH_REDIRECT_URI,
  resendApiKey: process.env.RESEND_API_KEY,
  resendFrom: process.env.RESEND_FROM,
  resendBrandIconUrl: process.env.RESEND_BRAND_ICON_URL
};
