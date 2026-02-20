import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFileDir = dirname(fileURLToPath(import.meta.url));

const envCandidates = [
  resolve(process.cwd(), 'server/.env'),
  resolve(process.cwd(), '.env'),
  resolve(currentFileDir, '../../.env')
];

const exampleCandidates = [
  resolve(process.cwd(), 'server/.env.example'),
  resolve(process.cwd(), '.env.example'),
  resolve(currentFileDir, '../../.env.example')
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
  nodeEnv: process.env.NODE_ENV ?? 'development'
};
