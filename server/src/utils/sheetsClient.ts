import { getSheetsClientForCompany } from '../integrations/google/sheets.client';
import { buildRange, escapeSheetName, normalizeRows } from './sheetsRange';

export class SheetsHttpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type NormalizedSheetSample = {
  headerRow: number;
  columns: string[];
  rows: Array<Record<string, string>>;
};

const toStatusCode = (message: string) => {
  const normalized = String(message).toLowerCase();
  if (
    normalized.includes('permission') ||
    normalized.includes('forbidden') ||
    normalized.includes('insufficient') ||
    normalized.includes('403')
  ) {
    return 403;
  }
  if (
    normalized.includes('not found') ||
    normalized.includes('unable to parse range') ||
    normalized.includes('tab_not_found') ||
    normalized.includes('404')
  ) {
    return 404;
  }
  return 400;
};

const normalizeSheetErrorMessage = (message: string) => {
  const normalized = String(message).toLowerCase();
  if (normalized.includes('tab_not_found') || normalized.includes('unable to parse range')) {
    return 'tab_not_found';
  }
  if (normalized.includes('not found') || normalized.includes('404')) {
    return 'not_found';
  }
  return message;
};

const listTabs = async (companyId: string, authMode: 'oauth' | 'service_account', spreadsheetId: string) => {
  const sheets = await getSheetsClientForCompany(authMode, companyId);
  try {
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))'
    });

    return (response.data.sheets ?? []).map((sheet) => ({
      sheetId: sheet.properties?.sheetId ?? null,
      title: sheet.properties?.title ?? '',
      index: sheet.properties?.index ?? 0,
      rowCount: sheet.properties?.gridProperties?.rowCount ?? null,
      columnCount: sheet.properties?.gridProperties?.columnCount ?? null
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list tabs';
    throw new SheetsHttpError(normalizeSheetErrorMessage(message), toStatusCode(message));
  }
};

const readSample = async (
  companyId: string,
  authMode: 'oauth' | 'service_account',
  spreadsheetId: string,
  sheetName: string,
  headerRow: number,
  limitRows: number
): Promise<NormalizedSheetSample> => {
  const sheets = await getSheetsClientForCompany(authMode, companyId);
  const parsedHeaderRow = Math.max(1, Number(headerRow ?? 1));
  const parsedLimit = Math.min(Math.max(Number(limitRows ?? 20), 1), 200);
  try {
    const tabs = await listTabs(companyId, authMode, spreadsheetId);
    const selectedTab = tabs.find((tab) => tab.title === sheetName)?.title;
    if (!selectedTab) {
      throw new SheetsHttpError('tab_not_found', 404);
    }

    const range = buildRange(selectedTab, parsedHeaderRow, parsedLimit);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const normalizedRows = normalizeRows(response.data.values as unknown[][] | undefined);
    const columns = normalizedRows[0] ?? [];
    const rows = normalizedRows.slice(1).map((values) =>
      Object.fromEntries(columns.map((column, idx) => [column, String(values[idx] ?? '')]))
    );

    return {
      headerRow: parsedHeaderRow,
      columns,
      rows
    };
  } catch (error) {
    if (error instanceof SheetsHttpError) throw error;
    const message = error instanceof Error ? error.message : 'Failed to read sheet sample';
    throw new SheetsHttpError(normalizeSheetErrorMessage(message), toStatusCode(message));
  }
};

export const listTabsOAuth = async (companyId: string, spreadsheetId: string) =>
  listTabs(companyId, 'oauth', spreadsheetId);

export const listTabsShared = async (companyId: string, spreadsheetId: string) =>
  listTabs(companyId, 'service_account', spreadsheetId);

export const readSheetSampleOAuth = async (
  companyId: string,
  spreadsheetId: string,
  sheetName: string,
  headerRow = 1,
  limitRows = 20
) => readSample(companyId, 'oauth', spreadsheetId, sheetName, headerRow, limitRows);

export const readSheetSampleShared = async (
  companyId: string,
  spreadsheetId: string,
  sheetName: string,
  headerRow = 1,
  limitRows = 20
) => readSample(companyId, 'service_account', spreadsheetId, sheetName, headerRow, limitRows);

export const buildFullSheetRange = (sheetName: string, headerRow: number) =>
  `${escapeSheetName(sheetName)}!A${Math.max(1, Number(headerRow ?? 1))}:Z`;
