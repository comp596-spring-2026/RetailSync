export type SheetsBindingMode = 'oauth' | 'service_account';

export const parseTabFromRange = (range: string | undefined | null) => {
  if (!range) return 'Sheet1';
  const first = String(range).split('!')[0]?.trim() ?? '';
  const cleaned = first.replace(/^'/, '').replace(/'$/, '').trim();
  return cleaned || 'Sheet1';
};

export const buildSheetsBindingKey = (params: {
  mode: SheetsBindingMode;
  profileName?: string | null;
  spreadsheetId?: string | null;
  sheetName?: string | null;
}) => {
  const mode = params.mode === 'oauth' ? 'oauth' : 'service_account';
  const profile = String(params.profileName ?? 'UNSPECIFIED').trim().toUpperCase() || 'UNSPECIFIED';
  const spreadsheetId = String(params.spreadsheetId ?? '').trim();
  const sheetName = String(params.sheetName ?? 'Sheet1').trim() || 'Sheet1';
  if (!spreadsheetId) return null;
  return `sheets:${mode}:${profile}:${spreadsheetId}:${sheetName.toUpperCase()}`;
};

