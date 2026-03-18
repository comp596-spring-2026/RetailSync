import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env';

export const LOCAL_SERVICE_ACCOUNT_FILE = 'gcp-service-account-retailsync-run-sa.json';

export type GoogleServiceAccountCredentials = Record<string, unknown>;

export const findLocalServiceAccountPath = () => {
  const thisFilePath = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFilePath);
  const candidates = [
    path.resolve(process.cwd(), 'credentials', LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(process.cwd(), '..', 'credentials', LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(thisDir, '../../../../credentials', LOCAL_SERVICE_ACCOUNT_FILE),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

export const parseServiceAccountJson = (value: string): GoogleServiceAccountCredentials => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is empty');
  }
  try {
    return JSON.parse(trimmed) as GoogleServiceAccountCredentials;
  } catch {
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      return JSON.parse(decoded) as GoogleServiceAccountCredentials;
    } catch {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (or base64-encoded JSON)');
    }
  }
};

export const resolveServiceAccountCredentials = (): GoogleServiceAccountCredentials | null => {
  if (env.googleServiceAccountJson) {
    return parseServiceAccountJson(env.googleServiceAccountJson);
  }
  const localCredsPath = findLocalServiceAccountPath();
  if (!localCredsPath) return null;
  return JSON.parse(fs.readFileSync(localCredsPath, 'utf-8')) as GoogleServiceAccountCredentials;
};
