import { google } from 'googleapis';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const LOCAL_SERVICE_ACCOUNT_FILE = 'gcp-service-account-retailsync-run-sa.json';

const findLocalServiceAccountPath = () => {
  const thisFilePath = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFilePath);
  const candidates = [
    path.resolve(process.cwd(), 'credentials', LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(process.cwd(), '..', 'credentials', LOCAL_SERVICE_ACCOUNT_FILE),
    path.resolve(thisDir, '../../../../credentials', LOCAL_SERVICE_ACCOUNT_FILE)
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
};

export function getSheetsClient() {
  const isProduction = process.env.NODE_ENV === 'production';
  const localCredsPath = isProduction ? null : findLocalServiceAccountPath();

  const auth = localCredsPath
    ? new google.auth.GoogleAuth({
        scopes: SHEETS_SCOPES,
        credentials: JSON.parse(fs.readFileSync(localCredsPath, 'utf-8'))
      })
    : new google.auth.GoogleAuth({ scopes: SHEETS_SCOPES });

  return google.sheets({ version: 'v4', auth });
}
