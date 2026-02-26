import { google } from 'googleapis';

const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

export function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({ scopes: SHEETS_SCOPES });
  return google.sheets({ version: 'v4', auth });
}
