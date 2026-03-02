import { PosDailySummaryInput, posDailyQuerySchema, posDailySummarySchema } from '@retailsync/shared';
import { parse } from 'csv-parse/sync';
import { Request, Response } from 'express';
import XLSX from 'xlsx';
import { z } from 'zod';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { ImportJobModel } from '../models/ImportJob';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { getSheetsClientForCompany } from '../integrations/google/sheets.client';
import { fail, ok } from '../utils/apiResponse';
import { suggestMappings } from '../utils/matching';
import { buildRange, escapeSheetName, normalizeRows } from '../utils/sheetsRange';
import { ensureSharedSheets, isEmptyRecord, normalizeStringRecord, pickDefaultSharedSheet, upsertSharedSheet } from '../utils/sharedSheets';
import { buildSheetsBindingKey } from '../utils/sheetsBinding';

type CsvRow = Record<string, string | undefined>;

const previewRequestSchema = z.object({
  source: z.enum(['service', 'oauth', 'file']).default('service'),
  spreadsheetId: z.string().min(5).optional(),
  headerRow: z.coerce.number().int().min(1).default(1),
  tab: z.string().min(1).optional(),
  maxRows: z.coerce.number().int().min(1).max(100).default(20)
});

const matchMappingSchema = z.object({
  mapping: z.record(z.string(), z.string()).default({}),
  transforms: z.record(z.string(), z.any()).optional(),
  validateSample: z.boolean().optional(),
  spreadsheetId: z.string().min(5).optional(),
  headerRow: z.coerce.number().int().min(1).optional(),
  tab: z.string().min(1).optional()
});

const commitImportSchema = z.object({
  mapping: z.record(z.string(), z.string()),
  transforms: z.record(z.string(), z.any()).optional(),
  options: z.record(z.string(), z.any()).optional()
});

const clearPosDataSchema = z.object({
  scope: z.enum(['all', 'date_range', 'source']).default('all'),
  confirmText: z.string().min(1),
  start: z.string().optional(),
  end: z.string().optional(),
  source: z.enum(['google_sheets', 'file', 'manual']).optional()
});

const optionalDateRangeSchema = z.object({
  start: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const posPagedDailyQuerySchema = optionalDateRangeSchema.extend({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

type DateRangeBounds = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
};

const TARGET_FIELDS = [
  'date',
  'day',
  'highTax',
  'lowTax',
  'saleTax',
  'totalSales',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'clTotal',
  'cash',
  'cashPayout',
  'cashExpenses',
  'notes'
];

const toNumber = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const toOptionalNumber = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const pick = (row: CsvRow, keys: string[]) => {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined) return direct;
    const found = Object.entries(row).find(([entry]) => entry.trim().toUpperCase() === key.trim().toUpperCase());
    if (found) return found[1];
  }
  return undefined;
};

const dayFromDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC'
  });

const normalizeDate = (value: string) => {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
};

const parseIsoStart = (iso: string) => {
  const value = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) return null;
  if (value.toISOString().slice(0, 10) !== iso) return null;
  return value;
};

const parseIsoEnd = (iso: string) => {
  const start = parseIsoStart(iso);
  if (!start) return null;
  const end = new Date(start);
  end.setUTCHours(23, 59, 59, 999);
  return end;
};

const resolveDateRange = (input: { start?: string; end?: string }) => {
  const now = new Date();
  const fallbackEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const parsedEnd = input.end ? parseIsoEnd(input.end) : fallbackEnd;
  if (!parsedEnd) return null;
  const parsedStart = input.start
    ? parseIsoStart(input.start)
    : new Date(Date.UTC(parsedEnd.getUTCFullYear(), parsedEnd.getUTCMonth(), parsedEnd.getUTCDate() - 29, 0, 0, 0, 0));
  if (!parsedStart) return null;
  if (parsedStart > parsedEnd) return null;
  return {
    start: parsedStart,
    end: parsedEnd,
    startIso: parsedStart.toISOString().slice(0, 10),
    endIso: parsedEnd.toISOString().slice(0, 10)
  } as DateRangeBounds;
};

type MovingAveragePoint = { x: string; y: number };

export const computeMovingAverageFallback = (rows: Array<{ date: Date; totalSales: number }>): MovingAveragePoint[] => {
  const points: MovingAveragePoint[] = [];
  let runningTotal = 0;
  const queue: number[] = [];

  for (const row of rows) {
    const value = Number(row.totalSales ?? 0);
    queue.push(value);
    runningTotal += value;
    if (queue.length > 7) {
      const removed = queue.shift() ?? 0;
      runningTotal -= removed;
    }
    points.push({
      x: row.date.toISOString(),
      y: Number((runningTotal / queue.length).toFixed(2))
    });
  }

  return points;
};

type AlertSeverity = 'low' | 'medium' | 'high';
type PosAlert = {
  id: string;
  type: 'sales_drop' | 'cash_diff' | 'lottery_payout_high' | 'tax_mismatch';
  severity: AlertSeverity;
  message: string;
  data: Record<string, unknown>;
};

const calcExpectedCash = (row: {
  totalSales: number;
  creditCard: number;
  lotteryPayout: number;
  cashExpenses: number;
  cashPayout: number;
}) => row.totalSales - row.creditCard - row.lotteryPayout - row.cashExpenses - row.cashPayout;

const calcCashDiff = (row: {
  totalSales: number;
  creditCard: number;
  lotteryPayout: number;
  cashExpenses: number;
  cashPayout: number;
  cash: number;
}) => row.cash - calcExpectedCash(row);

const calcTaxPercent = (row: { saleTax: number; totalSales: number }) =>
  row.totalSales > 0 ? (row.saleTax / row.totalSales) * 100 : 0;

const buildAlerts = (
  rows: Array<{
    date: Date;
    totalSales: number;
    cash: number;
    lottery: number;
    lotteryPayout: number;
    saleTax: number;
    creditCard: number;
    cashExpenses: number;
    cashPayout: number;
  }>,
  cashDiffThreshold = 200
): PosAlert[] => {
  if (rows.length === 0) return [];
  const alerts: PosAlert[] = [];
  const today = rows[rows.length - 1];
  const yesterday = rows.length > 1 ? rows[rows.length - 2] : null;
  const todayIso = today.date.toISOString().slice(0, 10);
  const todayCashDiff = calcCashDiff(today);
  const todayTaxPercent = calcTaxPercent(today);

  if (yesterday && yesterday.totalSales > 0) {
    const ratio = today.totalSales / yesterday.totalSales;
    if (ratio < 0.8) {
      alerts.push({
        id: `${todayIso}-sales-drop`,
        type: 'sales_drop',
        severity: 'high',
        message: `Sales dropped ${(1 - ratio) * 100 >= 0 ? ((1 - ratio) * 100).toFixed(1) : '0.0'}% versus yesterday.`,
        data: {
          today: today.totalSales,
          yesterday: yesterday.totalSales,
          ratio: Number(ratio.toFixed(4))
        }
      });
    }
  }

  if (Math.abs(todayCashDiff) > cashDiffThreshold) {
    alerts.push({
      id: `${todayIso}-cash-diff`,
      type: 'cash_diff',
      severity: Math.abs(todayCashDiff) > cashDiffThreshold * 2 ? 'high' : 'medium',
      message: `Cash difference is ${todayCashDiff.toFixed(2)} (threshold ${cashDiffThreshold.toFixed(2)}).`,
      data: {
        cashDiff: Number(todayCashDiff.toFixed(2)),
        threshold: cashDiffThreshold
      }
    });
  }

  if (today.lottery > 0) {
    const payoutRatio = today.lotteryPayout / today.lottery;
    if (payoutRatio > 0.5) {
      alerts.push({
        id: `${todayIso}-lottery-payout`,
        type: 'lottery_payout_high',
        severity: payoutRatio > 0.75 ? 'high' : 'medium',
        message: `Lottery payout ratio is ${(payoutRatio * 100).toFixed(1)}%.`,
        data: {
          lottery: today.lottery,
          lotteryPayout: today.lotteryPayout,
          ratio: Number(payoutRatio.toFixed(4))
        }
      });
    }
  }

  const taxSeries = rows.map((row) => calcTaxPercent(row));
  const historical = taxSeries.slice(0, -1);
  if (historical.length > 2) {
    const mean = historical.reduce((sum, value) => sum + value, 0) / historical.length;
    const min = mean - 5;
    const max = mean + 5;
    if (todayTaxPercent < min || todayTaxPercent > max) {
      alerts.push({
        id: `${todayIso}-tax-mismatch`,
        type: 'tax_mismatch',
        severity: 'medium',
        message: `Tax % (${todayTaxPercent.toFixed(2)}) is outside historical band (${min.toFixed(2)} - ${max.toFixed(2)}).`,
        data: {
          todayTaxPercent: Number(todayTaxPercent.toFixed(4)),
          historicalMean: Number(mean.toFixed(4)),
          min: Number(min.toFixed(4)),
          max: Number(max.toFixed(4))
        }
      });
    }
  }

  return alerts;
};

const toCsvCell = (value: unknown) => {
  const asText = String(value ?? '');
  if (!/[",\n]/.test(asText)) return asText;
  return `"${asText.replace(/"/g, '""')}"`;
};

const mapRow = (row: CsvRow) => {
  const dateValue = pick(row, ['DATE', 'date']);
  if (!dateValue) {
    return null;
  }

  const date = normalizeDate(dateValue);
  if (!date) {
    return null;
  }

  const highTax = toNumber(pick(row, ['HIGH TAX', 'highTax']));
  const lowTax = toNumber(pick(row, ['LOW TAX', 'lowTax']));
  const saleTax = toNumber(pick(row, ['SALE TAX', 'saleTax']));
  const gas = toNumber(pick(row, ['GAS', 'gas']));
  const lottery = toNumber(pick(row, ['LOTTERY SOLD', 'LOTTERY', 'lottery']));
  const creditCard = toNumber(pick(row, ['CREDIT CARD', 'creditCard']));
  const lotteryPayout = toNumber(pick(row, ['LOTTERY PAYOUT CASH', 'LOTTERY PAYOUT', 'lotteryPayout']));
  const mappedCashExpenses = toOptionalNumber(pick(row, ['CASH EXPENSES', 'CASH EXP.', 'CASH PAYOUT', 'cashExpenses']));
  const cashExpenses = mappedCashExpenses ?? 0;
  const notes = pick(row, ['DESCRIPTION', 'NOTES', 'notes']) ?? '';

  const mappedDay = pick(row, ['day', 'DAY']);
  const mappedTotalSales = toOptionalNumber(pick(row, ['totalSales', 'TOTAL SALES']));
  const mappedCash = toOptionalNumber(pick(row, ['cash', 'CASH DIFF']));
  const mappedClTotal = toOptionalNumber(pick(row, ['clTotal', 'CL TOTAL', 'CREDIT + LOTTERY TOTAL']));
  const mappedCashPayout = toOptionalNumber(pick(row, ['cashPayout', 'CASH PAYOUT']));

  const totalSales = mappedTotalSales ?? (highTax + lowTax);
  const cash = mappedCash ?? (totalSales - creditCard);
  const cashPayout = mappedCashPayout ?? cashExpenses;
  const clTotal = mappedClTotal ?? (creditCard + lottery);

  return {
    date,
    day: mappedDay?.trim() || dayFromDate(date),
    highTax,
    lowTax,
    saleTax,
    totalSales,
    gas,
    lottery,
    creditCard,
    lotteryPayout,
    clTotal,
    cash,
    cashPayout,
    cashExpenses,
    notes
  };
};

const parseRowsWithHeader = (rows: string[][]) => {
  if (rows.length < 2) return [] as CsvRow[];
  const [header, ...body] = rows;
  const normalizedHeader = header.map((cell) => String(cell ?? '').trim());
  return body
    .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0))
    .map((row) => {
      const obj: CsvRow = {};
      normalizedHeader.forEach((column, index) => {
        obj[column] = String(row[index] ?? '');
      });
      return obj;
    });
};

export const parseRowsWithHeaderRow = (rows: string[][], headerRow: number) => {
  if (rows.length < headerRow + 1) return [] as CsvRow[];
  const headerIndex = Math.max(0, headerRow - 1);
  const header = rows[headerIndex];
  const body = rows.slice(headerIndex + 1);
  const normalizedHeader = header.map((cell) => String(cell ?? '').trim());
  return body
    .filter((row) => row.some((cell) => String(cell ?? '').trim().length > 0))
    .map((row) => {
      const obj: CsvRow = {};
      normalizedHeader.forEach((column, index) => {
        obj[column] = String(row[index] ?? '');
      });
      return obj;
    });
};

const toSheetsErrorStatus = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('permission') || normalized.includes('forbidden') || normalized.includes('403')) {
    return 403;
  }
  if (normalized.includes('not found') || normalized.includes('404')) {
    return 404;
  }
  return 400;
};

const parseCsvFileRows = (buffer: Buffer) => {
  const csv = buffer.toString('utf-8');
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CsvRow[];
};

const parseXlsxRows = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [] as CsvRow[];
  const firstSheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(firstSheet, {
    defval: '',
    raw: false
  }) as CsvRow[];
};

const normalizeTargetValue = (target: string) => {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('custom:')) {
    return `custom:${trimmed.replace(/^custom:/, '').trim().toLowerCase()}`;
  }
  return trimmed.toLowerCase();
};

const getDuplicateTargets = (mapping: Record<string, string>) => {
  const counts = new Map<string, number>();
  for (const value of Object.values(mapping)) {
    if (!value) continue;
    const key = normalizeTargetValue(value);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
};

const getSharedSheetsSourceForCompany = async (companyId: string) => {
  const settings = await IntegrationSettingsModel.findOne({ companyId }).lean();
  const googleSheets = (settings?.googleSheets ?? {}) as Record<string, unknown>;
  const profile = pickDefaultSharedSheet(googleSheets);
  const spreadsheetId = profile?.spreadsheetId?.trim() ?? '';
  const sheetName = profile?.sheetName?.trim() || 'Sheet1';
  const headerRow = Number(profile?.headerRow ?? 1);
  const enabled = Boolean(profile?.enabled);

  if (!enabled) {
    throw new Error('Shared Sheets integration is disabled for this company');
  }
  if (!spreadsheetId) {
    throw new Error('Shared Sheets integration is missing spreadsheetId');
  }
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    throw new Error('Shared Sheets integration has invalid headerRow');
  }

  return {
    profileId: profile?.profileId ?? null,
    profileName: profile?.name ?? null,
    spreadsheetId,
    sheetName,
    headerRow,
    settingsId: settings?._id?.toString() ?? null,
    mode: 'service_account'
  };
};

export const readSharedSheetRows = async (
  companyId: string,
  opts?: { tab?: string; maxRows?: number }
) => {
  const source = await getSharedSheetsSourceForCompany(companyId);
  const authMode = source.mode === 'oauth' ? 'oauth' : 'service_account';
  const sheets = await getSheetsClientForCompany(authMode, companyId);
  const selectedTab = opts?.tab?.trim() || source.sheetName;

  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: source.spreadsheetId,
    fields: 'sheets(properties(title))'
  });
  const tabs = (metadata.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((tab): tab is string => Boolean(tab));
  if (!tabs.includes(selectedTab)) {
    throw new Error('tab_not_found');
  }

  const hasMaxRows = opts?.maxRows !== undefined;
  const maxRows = hasMaxRows ? Math.min(Math.max(Number(opts.maxRows), 1), 100) : undefined;
  const range = maxRows
    ? buildRange(selectedTab, source.headerRow, maxRows)
    : `${escapeSheetName(selectedTab)}!A${source.headerRow}:Z`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: source.spreadsheetId,
    range
  });
  const rawRows = normalizeRows(response.data.values as unknown[][] | undefined);
  return {
    source: { ...source, sheetName: selectedTab },
    rawRows,
    rowCount: rawRows.length
  };
};

const readSheetRowsDirect = async (
  companyId: string,
  opts: { spreadsheetId: string; tab?: string; headerRow: number; maxRows?: number; authMode: 'oauth' | 'service_account' }
) => {
  const spreadsheetId = opts.spreadsheetId.trim();
  const headerRow = Number(opts.headerRow ?? 1);
  if (!spreadsheetId) {
    throw new Error('spreadsheet_id_missing');
  }
  if (!Number.isFinite(headerRow) || headerRow < 1) {
    throw new Error('invalid_header_row');
  }

  const sheets = await getSheetsClientForCompany(opts.authMode, companyId);
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title))'
  });
  const tabs = (metadata.data.sheets ?? [])
    .map((sheet) => sheet.properties?.title)
    .filter((tab): tab is string => Boolean(tab));

  const selectedTab = (opts.tab?.trim() || tabs[0] || '').trim();
  if (!selectedTab) {
    throw new Error('no_tabs_found');
  }
  if (!tabs.includes(selectedTab)) {
    throw new Error('tab_not_found');
  }

  const hasMaxRows = opts.maxRows !== undefined;
  const maxRows = hasMaxRows ? Math.min(Math.max(Number(opts.maxRows), 1), 100) : undefined;
  const range = maxRows
    ? buildRange(selectedTab, headerRow, maxRows)
    : `${escapeSheetName(selectedTab)}!A${headerRow}:Z`;

  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rawRows = normalizeRows(response.data.values as unknown[][] | undefined);
  return {
    source: { spreadsheetId, sheetName: selectedTab, headerRow, settingsId: null, profileId: null, mode: opts.authMode === 'oauth' ? 'oauth' : 'service_account' },
    rawRows,
    rowCount: rawRows.length
  };
};

const applyMappingAndTransforms = (
  header: string[],
  sampleRows: string[][],
  mapping: Record<string, string>,
  transforms?: Record<string, unknown>
) => {
  const rowErrors: Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }> = [];
  const correctedPreview = sampleRows.slice(0, 3).map((row, rowIndex) => {
    const out: Record<string, string> = {};
    for (const [sourceHeader, targetField] of Object.entries(mapping)) {
      const colIndex = header.findIndex((item) => item.trim() === sourceHeader.trim());
      if (colIndex < 0) {
        rowErrors.push({
          rowIndex,
          errors: [{ col: sourceHeader, message: 'source header not found in preview header' }]
        });
        continue;
      }
      let value = String(row[colIndex] ?? '');
      const transform = transforms?.[targetField];
      if (transform && typeof transform === 'object') {
        const typed = transform as Record<string, unknown>;
        if (typed.trim === true) value = value.trim();
        if (typed.type === 'number') {
          const normalized = Number(value.replace(/,/g, ''));
          if (Number.isNaN(normalized)) {
            rowErrors.push({
              rowIndex,
              errors: [{ col: sourceHeader, message: 'value is not numeric' }]
            });
          } else {
            value = String(normalized);
          }
        }
      }
      out[targetField] = value;
    }
    return out;
  });

  return { rowErrors, correctedPreview };
};

export const importRowsForCompany = async (
  companyId: string,
  rawRows: CsvRow[],
  importSource: 'file' | 'google_sheets' | 'manual' = 'manual',
  opts?: {
    importBindingKey?: string | null;
    derivedFields?: string[];
    sourceRef?: {
      mode?: string | null;
      profileName?: string | null;
      spreadsheetId?: string | null;
      sheetName?: string | null;
      sourceId?: string | null;
      importJobId?: string | null;
      reason?: string | null;
    };
  }
) => {
  const parsedRows = rawRows.map(mapRow).filter((row): row is NonNullable<ReturnType<typeof mapRow>> => !!row);
  const validatedRows = parsedRows.map((row, index) => {
    const parsed = posDailySummarySchema.safeParse(row);
    if (!parsed.success) {
      return { index, error: parsed.error.flatten() };
    }
    return { index, data: parsed.data };
  });

  const validationError = validatedRows.find((row) => 'error' in row);
  if (validationError && 'error' in validationError) {
    return {
      ok: false as const,
      error: {
        rowIndex: validationError.index,
        issues: validationError.error
      }
    };
  }

  const normalizedRows = validatedRows.map((row) => (row as { index: number; data: PosDailySummaryInput }).data);
  if (normalizedRows.length === 0) {
    return {
      ok: false as const,
      error: {
        message: 'No valid POS rows found'
      }
    };
  }

  const ops = normalizedRows.map((row) => {
    const date = new Date(`${row.date}T00:00:00.000Z`);
    return {
      updateOne: {
        filter: { companyId, date },
        update: {
          $set: {
            ...row,
            date,
            source: importSource,
            importBindingKey: opts?.importBindingKey ?? null,
            derivedFieldsApplied: Array.isArray(opts?.derivedFields) ? opts?.derivedFields : undefined,
            sourceRef: opts?.sourceRef
              ? {
                  mode: opts.sourceRef.mode ?? null,
                  profileName: opts.sourceRef.profileName ?? null,
                  spreadsheetId: opts.sourceRef.spreadsheetId ?? null,
                  sheetName: opts.sourceRef.sheetName ?? null,
                  sourceId: opts.sourceRef.sourceId ?? null,
                  importJobId: opts.sourceRef.importJobId ?? null,
                  reason: opts.sourceRef.reason ?? null
                }
              : undefined
          }
        },
        upsert: true
      }
    };
  });

  const writeResult = await POSDailySummaryModel.bulkWrite(ops as any);

  return {
    ok: true as const,
    data: {
      imported: normalizedRows.length,
      upserted: writeResult.upsertedCount,
      modified: writeResult.modifiedCount
    }
  };
};

export const importPosCsv = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  if (!req.file) {
    return fail(res, 'CSV file is required', 400);
  }

  const rows = parseCsvFileRows(req.file.buffer);
  const result = await importRowsForCompany(req.companyId, rows, 'file', {
    sourceRef: { mode: 'file', reason: 'CSV file import' }
  });
  if (!result.ok) {
    return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
  }

  await IntegrationSettingsModel.updateOne(
    { companyId: req.companyId },
    { $set: { lastImportSource: 'file', lastImportAt: new Date() } }
  );

  return ok(res, result.data);
};

export const importPosFile = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  if (!req.file) {
    return fail(res, 'File is required', 400);
  }

  const mime = req.file.mimetype;
  const name = req.file.originalname.toLowerCase();
  const isCsv = mime.includes('csv') || name.endsWith('.csv');
  const isXlsx = mime.includes('spreadsheetml') || name.endsWith('.xlsx');

  if (!isCsv && !isXlsx) {
    return fail(res, 'Only .csv and .xlsx files are supported', 400);
  }

  const rows = isCsv ? parseCsvFileRows(req.file.buffer) : parseXlsxRows(req.file.buffer);
  const result = await importRowsForCompany(req.companyId, rows, 'file', {
    sourceRef: { mode: 'file', reason: 'File import' }
  });
  if (!result.ok) {
    return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
  }

  await IntegrationSettingsModel.updateOne(
    { companyId: req.companyId },
    { $set: { lastImportSource: 'file', lastImportAt: new Date() } }
  );

  return ok(res, result.data);
};

export const importPosRows = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const body = req.body as { rows?: string[][]; hasHeader?: boolean };
  const rows = body.rows;
  const hasHeader = body.hasHeader ?? true;

  if (!Array.isArray(rows) || rows.length === 0) {
    return fail(res, 'rows is required and must be a non-empty 2D array', 400);
  }

  const parsedRows = hasHeader ? parseRowsWithHeader(rows) : [];
  if (parsedRows.length === 0) {
    return fail(res, 'No data rows found. Ensure the first row contains headers.', 400);
  }

  const result = await importRowsForCompany(req.companyId, parsedRows, 'file', {
    sourceRef: { mode: 'file', reason: 'Rows import' }
  });
  if (!result.ok) {
    return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
  }

  return ok(res, result.data);
};

export const previewPosImportFromSharedSheet = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = previewRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  try {
    const spreadsheetIdOverride = parsed.data.spreadsheetId?.trim() ?? '';
    const headerRow = Number(parsed.data.headerRow ?? 1);
    if (spreadsheetIdOverride) {
      const { source: sharedSource, rawRows, rowCount } = await readSheetRowsDirect(req.companyId, {
        spreadsheetId: spreadsheetIdOverride,
        tab: parsed.data.tab,
        headerRow,
        authMode: parsed.data.source === 'oauth' ? 'oauth' : 'service_account',
        maxRows: parsed.data.maxRows
      });

      const header = rawRows[0] ?? [];
      const sampleRows = rawRows.slice(1, 11);
      const suggestions = suggestMappings(header, sampleRows, TARGET_FIELDS).map((entry, index) => ({
        col: String.fromCharCode(65 + index),
        header: entry.sourceHeader,
        suggestion: entry.targetField,
        score: entry.score
      }));

      return ok(res, {
        spreadsheetId: sharedSource.spreadsheetId,
        sheetName: sharedSource.sheetName,
        headerRow: sharedSource.headerRow,
        header,
        sampleRows,
        rowCount,
        suggestions
      });
    }

    const { source, rawRows, rowCount } = await readSharedSheetRows(req.companyId, {
      tab: parsed.data.tab,
      maxRows: parsed.data.maxRows
    });
    const header = rawRows[0] ?? [];
    const sampleRows = rawRows.slice(1, 11);
    const suggestions = suggestMappings(header, sampleRows, TARGET_FIELDS).map((entry, index) => ({
      col: String.fromCharCode(65 + index),
      header: entry.sourceHeader,
      suggestion: entry.targetField,
      score: entry.score
    }));

    return ok(res, {
      spreadsheetId: source.spreadsheetId,
      sheetName: source.sheetName,
      headerRow: source.headerRow,
      header,
      sampleRows,
      rowCount,
      suggestions
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shared Sheets preview failed';
    const statusCode = toSheetsErrorStatus(message);
    return fail(res, message, statusCode);
  }
};

export const matchPosImportMapping = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = matchMappingSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  const duplicateTargets = getDuplicateTargets(parsed.data.mapping);
  if (duplicateTargets.length > 0) {
    return fail(
      res,
      `One-to-one mapping required. Duplicate target fields: ${duplicateTargets.join(', ')}`,
      400
    );
  }

  try {
    const spreadsheetIdOverride = parsed.data.spreadsheetId?.trim() ?? '';
    const headerRowOverride = parsed.data.headerRow;
    if (spreadsheetIdOverride) {
      const { source, rawRows } = await readSheetRowsDirect(req.companyId, {
        spreadsheetId: spreadsheetIdOverride,
        tab: parsed.data.tab,
        headerRow: Number(headerRowOverride ?? 1),
        authMode: 'oauth',
        maxRows: 20
      });
      const header = rawRows[0] ?? [];
      const sampleRows = rawRows.slice(1, 11);
      const { rowErrors, correctedPreview } = applyMappingAndTransforms(
        header,
        sampleRows,
        parsed.data.mapping,
        parsed.data.transforms
      );

      return ok(res, {
        spreadsheetId: source.spreadsheetId,
        sheetName: source.sheetName,
        valid: rowErrors.length === 0,
        rowErrors,
        correctedPreview
      });
    }

    const { source, rawRows } = await readSharedSheetRows(req.companyId, {
      tab: parsed.data.tab,
      maxRows: 20
    });
    const header = rawRows[0] ?? [];
    const sampleRows = rawRows.slice(1, 11);
    const { rowErrors, correctedPreview } = applyMappingAndTransforms(
      header,
      sampleRows,
      parsed.data.mapping,
      parsed.data.transforms
    );

    return ok(res, {
      spreadsheetId: source.spreadsheetId,
      sheetName: source.sheetName,
      valid: rowErrors.length === 0,
      rowErrors,
      correctedPreview
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shared Sheets match failed';
    return fail(res, message, toSheetsErrorStatus(message));
  }
};

export const commitPosImportFromSharedSheet = async (req: Request, res: Response) => {
  if (!req.companyId || !req.user?.id) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsedCommit = commitImportSchema.safeParse(req.body ?? {});
  if (!parsedCommit.success) {
    return fail(res, 'Validation failed', 422, parsedCommit.error.flatten());
  }

  try {
    const selectedTab = (parsedCommit.data.options?.tab as string) || undefined;
    const selectedSpreadsheetId = String(parsedCommit.data.options?.spreadsheetId ?? '').trim() || undefined;
    const selectedHeaderRowRaw = parsedCommit.data.options?.headerRow;
    const selectedHeaderRow = selectedHeaderRowRaw !== undefined ? Number(selectedHeaderRowRaw) : undefined;

    const readResult = selectedSpreadsheetId
      ? await readSheetRowsDirect(req.companyId, {
          spreadsheetId: selectedSpreadsheetId,
          tab: selectedTab,
          headerRow: Number(selectedHeaderRow ?? 1),
          authMode: 'oauth'
        })
      : await readSharedSheetRows(req.companyId, { tab: selectedTab });

    const { source, rawRows } = readResult;
    const parsedRows = parseRowsWithHeaderRow(rawRows, source.headerRow);
    if (parsedRows.length === 0) {
      return fail(res, 'No data rows found in shared sheet', 400);
    }

    let effectiveMapping = parsedCommit.data.mapping;
    let effectiveTransforms = parsedCommit.data.transforms ?? {};

    const resolveSavedMappingAndTransforms = async () => {
      const settings = await IntegrationSettingsModel.findOne({ companyId: req.companyId }).lean();
      const googleSheets = (settings?.googleSheets ?? {}) as Record<string, unknown>;
      ensureSharedSheets(googleSheets);

      const requestedMode = String(parsedCommit.data.options?.mode ?? '').trim();
      const requestedProfileId = String(parsedCommit.data.options?.profileId ?? '').trim();
      const requestedProfileName = String(parsedCommit.data.options?.profileName ?? '').trim().toUpperCase();
      const requestedSourceId = String(parsedCommit.data.options?.sourceId ?? '').trim();

      if (requestedMode === 'oauth' || selectedSpreadsheetId) {
        const sources = ((googleSheets as any).sources ?? []) as Array<Record<string, unknown>>;
        const source =
          (requestedSourceId
            ? sources.find((entry) => String(entry.sourceId ?? '') === requestedSourceId)
            : null)
          ?? (requestedProfileName
            ? sources.find((entry) => String(entry.name ?? '').trim().toUpperCase() === requestedProfileName)
            : null)
          ?? sources.find((entry) => String(entry.spreadsheetId ?? '').trim() === (selectedSpreadsheetId ?? ''))
          ?? sources.find((entry) => entry.active === true)
          ?? sources[0]
          ?? null;
        return {
          mapping: normalizeStringRecord(source?.mapping),
          transforms: (source?.transformations as Record<string, unknown> | undefined) ?? {},
          profileName: String(source?.name ?? (requestedProfileName || 'POS DATA SHEET'))
        };
      }

      const profiles = ((googleSheets as any).sharedSheets ?? []) as Array<Record<string, unknown>>;
      const profile =
        (requestedProfileId
          ? profiles.find((entry) => String(entry.profileId ?? '') === requestedProfileId)
          : null)
        ?? (requestedProfileName
          ? profiles.find((entry) => String(entry.name ?? '').trim().toUpperCase() === requestedProfileName)
          : null)
        ?? (source.profileId
          ? profiles.find((entry) => String(entry.profileId ?? '') === String(source.profileId))
          : null)
        ?? pickDefaultSharedSheet(googleSheets);

      const columnsMap = normalizeStringRecord((profile as any)?.columnsMap);
      const lastMap = normalizeStringRecord((profile as any)?.lastMapping?.columnsMap);
      return {
        mapping: !isEmptyRecord(columnsMap) ? columnsMap : lastMap,
        transforms: ((profile as any)?.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {},
        profileName: String((profile as any)?.name ?? 'POS DATA SHEET')
      };
    };

    let resolvedProfileName =
      String(parsedCommit.data.options?.profileName ?? '').trim()
      || (('profileName' in source && typeof source.profileName === 'string')
        ? String(source.profileName).trim()
        : '')
      || 'POS DATA SHEET';

    if (isEmptyRecord(effectiveMapping) || isEmptyRecord(effectiveTransforms)) {
      const fallback = await resolveSavedMappingAndTransforms();
      if (isEmptyRecord(effectiveMapping)) {
        effectiveMapping = fallback.mapping;
      }
      if (isEmptyRecord(effectiveTransforms)) {
        effectiveTransforms = fallback.transforms;
      }
      resolvedProfileName = resolvedProfileName || fallback.profileName;
    }

    if (isEmptyRecord(effectiveMapping)) {
      return fail(res, 'No saved field mapping found. Map columns first, then import.', 400);
    }
    const duplicateTargets = getDuplicateTargets(effectiveMapping);
    if (duplicateTargets.length > 0) {
      return fail(
        res,
        `One-to-one mapping required. Duplicate target fields: ${duplicateTargets.join(', ')}`,
        400
      );
    }

    const mappedRows = parsedRows.map((row) => {
      const out: Record<string, string | undefined> = {};
      for (const [sourceHeader, targetField] of Object.entries(effectiveMapping)) {
        if (!targetField) continue;
        const normalizedTargetField = targetField.startsWith('custom:') ? targetField.replace(/^custom:/, '').trim() : targetField;
        if (!normalizedTargetField) continue;
        const raw = row[sourceHeader];
        if (raw === undefined) continue;
        let value = String((raw ?? '')).trim();
        out[normalizedTargetField] = value;
      }
      return out;
    });

    const selectedProfileName = resolvedProfileName || 'POS DATA SHEET';
    const selectedMode = selectedSpreadsheetId || String(parsedCommit.data.options?.mode ?? '').trim() === 'oauth'
      ? 'oauth'
      : 'service_account';
    const importBindingKey = buildSheetsBindingKey({
      mode: selectedMode,
      profileName: selectedProfileName,
      spreadsheetId: source.spreadsheetId,
      sheetName: source.sheetName
    });
    const derivedFields = Array.isArray((effectiveTransforms as Record<string, unknown>).__derivedFields)
      ? ((effectiveTransforms as Record<string, unknown>).__derivedFields as unknown[])
          .map((value) => String(value))
          .filter(Boolean)
      : undefined;

    const result = await importRowsForCompany(req.companyId, mappedRows, 'google_sheets', {
      importBindingKey,
      derivedFields,
      sourceRef: {
        mode: selectedMode,
        profileName: selectedProfileName,
        spreadsheetId: source.spreadsheetId,
        sheetName: source.sheetName,
        sourceId: String(parsedCommit.data.options?.sourceId ?? '') || null,
        reason: 'Mapped sheet import'
      }
    });
    if (!result.ok) {
      return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
    }

    const settingsIdToUpdate = source.settingsId
      ? source.settingsId
      : (await IntegrationSettingsModel.findOne({ companyId: req.companyId }).select('_id').lean())?._id?.toString() ?? null;

    if (settingsIdToUpdate) {
      const settingsDoc = await IntegrationSettingsModel.findById(settingsIdToUpdate);
      if (settingsDoc?.googleSheets) {
        const googleSheets = settingsDoc.googleSheets as unknown as Record<string, unknown>;
        ensureSharedSheets(googleSheets);
        upsertSharedSheet(googleSheets, {
          profileId: (source.profileId as string | null) ?? undefined,
          profileName: selectedSpreadsheetId ? 'POS Data SHEET' : undefined,
          spreadsheetId: selectedSpreadsheetId ?? source.spreadsheetId,
          sheetName: source.sheetName,
          headerRow: source.headerRow,
          enabled: true,
          columnsMap: effectiveMapping,
          lastImportAt: new Date(),
          lastMapping: {
            columnsMap: effectiveMapping,
            transformations: effectiveTransforms,
            createdAt: new Date(),
            createdBy: req.user.id
          }
        });
        settingsDoc.googleSheets.connected = true;
        if (selectedMode === 'oauth') {
          const targetName = String(parsedCommit.data.options?.profileName ?? '').trim().toUpperCase();
          const sourceByName = settingsDoc.googleSheets.sources.find(
            (entry: any) => String(entry.name ?? '').trim().toUpperCase() === targetName
          );
          if (sourceByName) {
            sourceByName.transformations = effectiveTransforms as any;
          }
        }
        settingsDoc.googleSheets.updatedAt = new Date();
        settingsDoc.lastImportSource = 'google_sheets';
        settingsDoc.lastImportAt = new Date();
        await settingsDoc.save();
      }
    }

    const importJob = await ImportJobModel.create({
      companyId: req.companyId,
      createdBy: req.user.id,
      source: source.mode === 'oauth' ? 'oauth' : 'service',
      status: 'processing',
      mapping: effectiveMapping,
      transforms: effectiveTransforms,
      options: parsedCommit.data.options ?? {}
    });

    await ImportJobModel.updateOne(
      { _id: importJob._id },
      { $set: { status: 'done', 'options.summary': result.data } }
    );

    return ok(res, {
      jobId: importJob._id.toString(),
      result: {
        ...result.data,
        spreadsheetId: source.spreadsheetId,
        sheetName: source.sheetName
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shared Sheets commit failed';
    return fail(res, message, toSheetsErrorStatus(message));
  }
};

export const listPosDaily = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = posDailyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const start = new Date(`${parsed.data.start}T00:00:00.000Z`);
  const end = new Date(`${parsed.data.end}T23:59:59.999Z`);

  const rows = await POSDailySummaryModel.find({
    companyId: req.companyId,
    date: { $gte: start, $lte: end }
  }).sort({ date: 1 });

  return ok(res, rows);
};

export const listPosDailyPaged = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = posPagedDailyQuerySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const bounds = resolveDateRange(parsed.data);
  if (!bounds) {
    return fail(res, 'Invalid start/end date range', 400);
  }

  const { page, limit } = parsed.data;
  const skip = (page - 1) * limit;
  const filter = {
    companyId: req.companyId,
    date: { $gte: bounds.start, $lte: bounds.end }
  };

  const [data, totalCount, totalsAgg] = await Promise.all([
    POSDailySummaryModel.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
    POSDailySummaryModel.countDocuments(filter),
    POSDailySummaryModel.aggregate<{
      totalSales: number;
      creditCard: number;
      cash: number;
      gas: number;
      lottery: number;
      lotteryPayout: number;
      cashExpenses: number;
      cashPayout: number;
      highTax: number;
      lowTax: number;
      saleTax: number;
    }>([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalSales' },
          creditCard: { $sum: '$creditCard' },
          cash: { $sum: '$cash' },
          gas: { $sum: '$gas' },
          lottery: { $sum: '$lottery' },
          lotteryPayout: { $sum: '$lotteryPayout' },
          cashExpenses: { $sum: '$cashExpenses' },
          cashPayout: { $sum: '$cashPayout' },
          highTax: { $sum: '$highTax' },
          lowTax: { $sum: '$lowTax' },
          saleTax: { $sum: '$saleTax' }
        }
      }
    ])
  ]);

  const totals = totalsAgg[0] ?? {
    totalSales: 0,
    creditCard: 0,
    cash: 0,
    gas: 0,
    lottery: 0,
    lotteryPayout: 0,
    cashExpenses: 0,
    cashPayout: 0,
    highTax: 0,
    lowTax: 0,
    saleTax: 0
  };

  return ok(res, {
    data,
    totals,
    page,
    limit,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / limit)),
    start: bounds.startIso,
    end: bounds.endIso
  });
};

export const getPosOverview = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = optionalDateRangeSchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  const bounds = resolveDateRange(parsed.data);
  if (!bounds) {
    return fail(res, 'Invalid start/end date range', 400);
  }

  const filter = {
    companyId: req.companyId,
    date: { $gte: bounds.start, $lte: bounds.end }
  };

  const [totalsAgg, orderedRows] = await Promise.all([
    POSDailySummaryModel.aggregate<{
      totalSales: number;
      creditCard: number;
      cash: number;
      gas: number;
      lottery: number;
      lotteryPayout: number;
      saleTax: number;
      cashExpenses: number;
      cashPayout: number;
      count: number;
    }>([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalSales' },
          creditCard: { $sum: '$creditCard' },
          cash: { $sum: '$cash' },
          gas: { $sum: '$gas' },
          lottery: { $sum: '$lottery' },
          lotteryPayout: { $sum: '$lotteryPayout' },
          saleTax: { $sum: '$saleTax' },
          cashExpenses: { $sum: '$cashExpenses' },
          cashPayout: { $sum: '$cashPayout' },
          count: { $sum: 1 }
        }
      }
    ]),
    POSDailySummaryModel.find(filter)
      .select('date totalSales creditCard cash gas lottery lotteryPayout cashExpenses cashPayout saleTax day')
      .sort({ date: 1 })
  ]);

  const totals = totalsAgg[0] ?? {
    totalSales: 0,
    creditCard: 0,
    cash: 0,
    gas: 0,
    lottery: 0,
    lotteryPayout: 0,
    saleTax: 0,
    cashExpenses: 0,
    cashPayout: 0,
    count: 0
  };
  const averageDailySales = totals.count > 0 ? totals.totalSales / totals.count : 0;
  const cashDiffTotal =
    totals.cash -
    (totals.totalSales - totals.creditCard - totals.lotteryPayout - totals.cashExpenses - totals.cashPayout);
  const netIncome = totals.totalSales - totals.saleTax - totals.cashExpenses - totals.cashPayout;

  let sparkline7: MovingAveragePoint[] = [];
  try {
    const windowRows = await POSDailySummaryModel.aggregate<{ x: Date; y: number }>([
      { $match: filter },
      { $sort: { date: 1 } },
      {
        $setWindowFields: {
          sortBy: { date: 1 },
          output: {
            y: {
              $avg: '$totalSales',
              window: { documents: [-6, 0] }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          x: '$date',
          y: '$y'
        }
      }
    ]);
    sparkline7 = windowRows.map((entry) => ({
      x: entry.x.toISOString(),
      y: Number((entry.y ?? 0).toFixed(2))
    }));
  } catch {
    sparkline7 = computeMovingAverageFallback(
      orderedRows.map((row) => ({ date: row.date, totalSales: row.totalSales }))
    );
  }

  const alerts = buildAlerts(
    orderedRows.map((row) => ({
      date: row.date,
      totalSales: row.totalSales,
      creditCard: row.creditCard,
      cash: row.cash,
      lottery: row.lottery,
      lotteryPayout: row.lotteryPayout,
      cashExpenses: row.cashExpenses,
      cashPayout: row.cashPayout,
      saleTax: row.saleTax
    }))
  );

  return ok(res, {
    kpis: {
      totalSales: totals.totalSales,
      creditCard: totals.creditCard,
      cash: totals.cash,
      gas: totals.gas,
      lottery: totals.lottery,
      lotteryPayout: totals.lotteryPayout,
      cashExpenses: totals.cashExpenses,
      cashPayout: totals.cashPayout,
      cashDiff: Number(cashDiffTotal.toFixed(2)),
      netIncome: Number(netIncome.toFixed(2)),
      avgDailySales: Number(averageDailySales.toFixed(2))
    },
    sparkline7,
    alerts,
    start: bounds.startIso,
    end: bounds.endIso
  });
};

export const exportPosDailyCsv = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = optionalDateRangeSchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }
  const bounds = resolveDateRange(parsed.data);
  if (!bounds) {
    return fail(res, 'Invalid start/end date range', 400);
  }

  const rows = await POSDailySummaryModel.find({
    companyId: req.companyId,
    date: { $gte: bounds.start, $lte: bounds.end }
  }).sort({ date: 1 });

  const headers = [
    'date',
    'day',
    'highTax',
    'lowTax',
    'saleTax',
    'totalSales',
    'creditCard',
    'cash',
    'gas',
    'lottery',
    'lotteryPayout',
    'cashExpenses',
    'cashPayout',
    'notes',
    'source'
  ];

  const lines = [
    headers.join(','),
    ...rows.map((row) =>
      [
        row.date.toISOString().slice(0, 10),
        row.day,
        row.highTax,
        row.lowTax,
        row.saleTax,
        row.totalSales,
        row.creditCard,
        row.cash,
        row.gas,
        row.lottery,
        row.lotteryPayout,
        row.cashExpenses,
        row.cashPayout,
        row.notes,
        row.source
      ]
        .map(toCsvCell)
        .join(',')
    )
  ];

  const fileName = `pos-daily-${bounds.startIso}_to_${bounds.endIso}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.status(200).send(lines.join('\n'));
};

export const clearPosDailyData = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = clearPosDataSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  if (parsed.data.confirmText.trim().toUpperCase() !== 'CLEAR POS DATA') {
    return fail(res, 'confirmText must match "CLEAR POS DATA"', 400);
  }

  const filter: Record<string, unknown> = { companyId: req.companyId };
  if (parsed.data.scope === 'date_range') {
    if (!parsed.data.start || !parsed.data.end) {
      return fail(res, 'start and end are required for date_range scope', 400);
    }
    const start = new Date(`${parsed.data.start}T00:00:00.000Z`);
    const end = new Date(`${parsed.data.end}T23:59:59.999Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return fail(res, 'Invalid start/end dates', 400);
    }
    filter.date = { $gte: start, $lte: end };
  }
  if (parsed.data.scope === 'source') {
    if (!parsed.data.source) {
      return fail(res, 'source is required for source scope', 400);
    }
    filter.source = parsed.data.source;
  }

  const result = await POSDailySummaryModel.deleteMany(filter);

  await IntegrationSettingsModel.updateOne(
    { companyId: req.companyId },
    { $set: { lastImportSource: null, lastImportAt: null } }
  );

  return ok(res, {
    ok: true,
    deletedCount: result.deletedCount ?? 0,
    scope: parsed.data.scope
  });
};
