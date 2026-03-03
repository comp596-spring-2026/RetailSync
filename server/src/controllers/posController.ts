import { PosDailySummaryInput, posDailyQuerySchema, posDailySummarySchema } from '@retailsync/shared';
import { parse } from 'csv-parse/sync';
import { Request, Response } from 'express';
import { Types } from 'mongoose';
import XLSX from 'xlsx';
import { z } from 'zod';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { ImportJobModel } from '../models/ImportJob';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { getSheetsClientForCompany } from '../integrations/google/sheets.client';
import { markConnectorImported } from './googleSheetsController';
import { fail, ok } from '../utils/apiResponse';
import { suggestMappings } from '../utils/matching';
import { buildRange, normalizeRows } from '../utils/sheetsRange';
import { DEFAULT_CONNECTOR_KEY } from '../utils/sheetsConnectors';
import {
  computeCompatibilityForConnector,
  validateColumnMapOneToOne
} from '../utils/sheetsCompatibility';
import {
  buildFullSheetRange,
  readSheetSampleOAuth,
  readSheetSampleShared,
  SheetsHttpError
} from '../utils/sheetsClient';
import {
  resolveActiveSheetsConfig,
  resolveSheetsConfigByRef,
  SheetsConfigError
} from '../utils/sheetsSourceResolver';
import {
  evaluateConfiguredPosRow,
  validateDerivedConfiguration
} from '../utils/posDerivedEvaluator';

type CsvRow = Record<string, string | undefined>;

const previewRequestSchema = z.object({
  integrationType: z.enum(['oauth', 'shared']).optional(),
  sourceId: z.string().optional(),
  profileId: z.string().optional(),
  connectorKey: z.string().optional(),
  useActive: z.boolean().optional(),
  spreadsheetId: z.string().min(5).optional(),
  sheetName: z.string().min(1).optional(),
  headerRow: z.coerce.number().int().min(1).optional(),
  mapping: z.record(z.string(), z.string()).optional(),
  transformations: z.record(z.string(), z.unknown()).optional(),
  maxRows: z.coerce.number().int().min(1).max(100).default(20),
  source: z.enum(['service', 'oauth', 'file']).optional(),
  tab: z.string().min(1).optional()
});

const matchMappingSchema = z.object({
  connectorKey: z.string().default(DEFAULT_CONNECTOR_KEY),
  mapping: z.record(z.string(), z.string()).default({}),
  columns: z.array(z.string()).default([]),
  transformations: z.record(z.string(), z.unknown()).optional()
});

const commitImportSchema = z.object({
  connectorKey: z.string().default(DEFAULT_CONNECTOR_KEY),
  integrationType: z.enum(['oauth', 'shared']).optional(),
  sourceId: z.string().optional(),
  profileId: z.string().optional()
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
const posTrendQuerySchema = optionalDateRangeSchema.extend({
  granularity: z.enum(['daily', 'weekly']).default('daily')
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
  'creditPlusLottery',
  'cashDiff',
  // Backward-compatible aliases still accepted in mapping
  'clTotal',
  'cash',
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

const toAggregateCompanyId = (companyId: string) =>
  Types.ObjectId.isValid(companyId) ? new Types.ObjectId(companyId) : companyId;

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const getIsoWeekUtc = (date: Date) => {
  const value = startOfUtcDay(date);
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: value.getUTCFullYear() };
};

const getMondayUtc = (date: Date) => {
  const monday = startOfUtcDay(date);
  const dayFromMonday = (monday.getUTCDay() + 6) % 7;
  monday.setUTCDate(monday.getUTCDate() - dayFromMonday);
  return monday;
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

const toSheetsErrorStatus = (error: unknown) => {
  if (error instanceof SheetsConfigError) return error.statusCode;
  if (error instanceof SheetsHttpError) return error.statusCode;

  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('permission') || message.includes('forbidden') || message.includes('403')) {
    return 403;
  }
  if (
    message.includes('tab_not_found') ||
    message.includes('unable to parse range') ||
    message.includes('not found') ||
    message.includes('404')
  ) {
    return 404;
  }
  return 400;
};

const toSheetsErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : 'Sheets request failed';
  const normalized = message.toLowerCase();
  if (normalized.includes('tab_not_found') || normalized.includes('unable to parse range')) {
    return 'tab_not_found';
  }
  if (normalized.includes('not found') || normalized.includes('404')) {
    return 'not_found';
  }
  if (normalized.includes('permission') || normalized.includes('forbidden') || normalized.includes('403')) {
    return 'forbidden';
  }
  return message;
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

const resolveLegacyIntegrationType = (source?: string): 'oauth' | 'shared' | undefined => {
  if (!source) return undefined;
  if (source === 'oauth') return 'oauth';
  if (source === 'service') return 'shared';
  return undefined;
};

const resolveConfigFromRequest = async (
  companyId: string,
  params: {
    integrationType?: 'oauth' | 'shared';
    sourceId?: string;
    profileId?: string;
    connectorKey?: string;
    source?: string;
  }
) => {
  const integrationType = params.integrationType ?? resolveLegacyIntegrationType(params.source);
  const connectorKey = String(params.connectorKey ?? '').trim() || DEFAULT_CONNECTOR_KEY;

  if (!integrationType) {
    return resolveActiveSheetsConfig(companyId, connectorKey);
  }

  return resolveSheetsConfigByRef(companyId, {
    integrationType,
    sourceId: params.sourceId,
    profileId: params.profileId,
    connectorKey
  });
};

const readRowsForResolvedConfig = async (
  companyId: string,
  resolved: Awaited<ReturnType<typeof resolveActiveSheetsConfig>>,
  opts?: { limitRows?: number; sheetNameOverride?: string }
) => {
  const authMode = resolved.integrationType === 'oauth' ? 'oauth' : 'service_account';
  const sheets = await getSheetsClientForCompany(authMode, companyId);
  const sheetName = String(opts?.sheetNameOverride ?? resolved.sheetName).trim() || resolved.sheetName;
  const limitRows = opts?.limitRows;
  const range =
    typeof limitRows === 'number'
      ? buildRange(sheetName, resolved.headerRow, Math.min(Math.max(limitRows, 1), 200))
      : buildFullSheetRange(sheetName, resolved.headerRow);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: resolved.spreadsheetId,
    range
  });
  const rawRows = normalizeRows(response.data.values as unknown[][] | undefined);
  return {
    rawRows,
    rowCount: rawRows.length,
    sheetName
  };
};

export const readSharedSheetRows = async (
  companyId: string,
  opts?: { tab?: string; maxRows?: number; profileId?: string; connectorKey?: string }
) => {
  const resolved = await resolveSheetsConfigByRef(companyId, {
    integrationType: 'shared',
    profileId: opts?.profileId,
    connectorKey: opts?.connectorKey
  });
  const { rawRows, rowCount, sheetName } = await readRowsForResolvedConfig(companyId, resolved, {
    limitRows: opts?.maxRows,
    sheetNameOverride: opts?.tab
  });

  return {
    source: {
      integrationType: 'shared' as const,
      connectorKey: resolved.connectorKey,
      profileId: resolved.ref.profileId ?? null,
      profileName: resolved.ref.profileName ?? null,
      spreadsheetId: resolved.spreadsheetId,
      sheetName,
      headerRow: resolved.headerRow,
      mapping: resolved.mapping,
      transformations: resolved.transformations
    },
    rawRows,
    rowCount
  };
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
  return upsertPosRowsForCompany(companyId, normalizedRows, importSource, opts);
};

const upsertPosRowsForCompany = async (
  companyId: string,
  normalizedRows: PosDailySummaryInput[],
  importSource: 'file' | 'google_sheets' | 'manual',
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

export const importEvaluatedRowsForCompany = async (
  companyId: string,
  rows: PosDailySummaryInput[],
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
  const validatedRows = rows.map((row, index) => {
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
  return upsertPosRowsForCompany(companyId, normalizedRows, importSource, opts);
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
    return fail(res, ('message' in result.error ? result.error.message : 'Validation failed'), 422, result.error);
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
    return fail(res, ('message' in result.error ? result.error.message : 'Validation failed'), 422, result.error);
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
    return fail(res, ('message' in result.error ? result.error.message : 'Validation failed'), 422, result.error);
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
    const sheetName = String(parsed.data.sheetName ?? parsed.data.tab ?? 'Sheet1').trim() || 'Sheet1';
    const integrationType =
      parsed.data.integrationType ?? resolveLegacyIntegrationType(parsed.data.source) ?? 'shared';

    if (spreadsheetIdOverride) {
      const sample =
        integrationType === 'oauth'
          ? await readSheetSampleOAuth(
              req.companyId,
              spreadsheetIdOverride,
              sheetName,
              Number(parsed.data.headerRow ?? 1),
              parsed.data.maxRows
            )
          : await readSheetSampleShared(
              req.companyId,
              spreadsheetIdOverride,
              sheetName,
              Number(parsed.data.headerRow ?? 1),
              parsed.data.maxRows
            );
      const sampleRowsMatrix = sample.rows.map((entry) =>
        sample.columns.map((column) => String(entry[column] ?? ''))
      );
      const suggestions = suggestMappings(sample.columns, sampleRowsMatrix, TARGET_FIELDS).map(
        (entry, index) => ({
          col: String.fromCharCode(65 + index),
          header: entry.sourceHeader,
          suggestion: entry.targetField,
          score: entry.score
        })
      );

      return ok(res, {
        integrationType,
        connectorKey: parsed.data.connectorKey ?? DEFAULT_CONNECTOR_KEY,
        spreadsheetId: spreadsheetIdOverride,
        sheetName,
        detectedHeaderRow: sample.headerRow,
        columns: sample.columns,
        sampleRows: sampleRowsMatrix.slice(0, 10),
        rowCount: sample.rows.length,
        suggestions
      });
    }

    const resolved = await resolveConfigFromRequest(req.companyId, {
      integrationType: parsed.data.integrationType,
      sourceId: parsed.data.sourceId,
      profileId: parsed.data.profileId,
      connectorKey: parsed.data.connectorKey,
      source: parsed.data.source
    });
    const sample =
      resolved.integrationType === 'oauth'
        ? await readSheetSampleOAuth(
            req.companyId,
            resolved.spreadsheetId,
            String(parsed.data.sheetName ?? parsed.data.tab ?? resolved.sheetName),
            resolved.headerRow,
            parsed.data.maxRows
          )
        : await readSheetSampleShared(
            req.companyId,
            resolved.spreadsheetId,
            String(parsed.data.sheetName ?? parsed.data.tab ?? resolved.sheetName),
            resolved.headerRow,
            parsed.data.maxRows
          );

    const sampleRowsMatrix = sample.rows.map((entry) =>
      sample.columns.map((column) => String(entry[column] ?? ''))
    );
    const suggestions = suggestMappings(sample.columns, sampleRowsMatrix, TARGET_FIELDS).map(
      (entry, index) => ({
        col: String.fromCharCode(65 + index),
        header: entry.sourceHeader,
        suggestion: entry.targetField,
        score: entry.score
      })
    );

    return ok(res, {
      integrationType: resolved.integrationType,
      connectorKey: resolved.connectorKey,
      spreadsheetId: resolved.spreadsheetId,
      sheetName: resolved.sheetName,
      detectedHeaderRow: sample.headerRow,
      columns: sample.columns,
      sampleRows: sampleRowsMatrix.slice(0, 10),
      rowCount: sample.rows.length,
      suggestions
    });
  } catch (error) {
    const message = toSheetsErrorMessage(error);
    const statusCode = toSheetsErrorStatus(error);
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

  const oneToOne = validateColumnMapOneToOne(parsed.data.mapping);
  const compatibility = computeCompatibilityForConnector({
    connectorKey: parsed.data.connectorKey,
    columns: parsed.data.columns,
    mapping: parsed.data.mapping
  });
  const derivedValidation = validateDerivedConfiguration({
    headers: parsed.data.columns,
    mapping: parsed.data.mapping,
    transformations: parsed.data.transformations
  });

  return ok(res, {
    connectorKey: parsed.data.connectorKey,
    valid: oneToOne.ok && compatibility.status !== 'error' && derivedValidation.ok,
    compatibility,
    derivedValidation
  });
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
    if (parsedCommit.data.connectorKey !== 'pos_daily') {
      return fail(res, 'Unsupported connector', 400);
    }

    const resolved =
      parsedCommit.data.integrationType != null
        ? await resolveSheetsConfigByRef(req.companyId, {
            integrationType: parsedCommit.data.integrationType,
            sourceId: parsedCommit.data.sourceId,
            profileId: parsedCommit.data.profileId,
            connectorKey: parsedCommit.data.connectorKey
          })
        : await resolveActiveSheetsConfig(req.companyId, parsedCommit.data.connectorKey);

    const { rawRows } = await readRowsForResolvedConfig(req.companyId, resolved);
    const columns = rawRows[Math.max(0, resolved.headerRow - 1)] ?? [];
    const compatibility = computeCompatibilityForConnector({
      connectorKey: resolved.connectorKey,
      columns,
      mapping: resolved.mapping
    });
    if (compatibility.status === 'error') {
      return fail(res, 'Connector mapping is not compatible', 400, compatibility);
    }
    const derivedValidation = validateDerivedConfiguration({
      headers: columns,
      mapping: resolved.mapping,
      transformations: resolved.transformations
    });
    if (!derivedValidation.ok) {
      return fail(res, 'Derived mapping configuration is invalid', 400, {
        compatibility,
        derivedValidation
      });
    }

    const parsedRows = parseRowsWithHeaderRow(rawRows, resolved.headerRow);
    if (parsedRows.length === 0) {
      return fail(res, 'No data rows found in configured sheet', 400);
    }

    const evaluatedRows: PosDailySummaryInput[] = [];
    for (let index = 0; index < parsedRows.length; index += 1) {
      const evaluated = evaluateConfiguredPosRow({
        row: parsedRows[index],
        mapping: resolved.mapping,
        transformations: resolved.transformations
      });
      if (!evaluated.ok) {
        const sheetRow = resolved.headerRow + index + 1;
        return fail(res, `Row ${index + 1} (sheet row ${sheetRow}): ${evaluated.reason}`, 422, {
          rowIndex: index,
          sheetRow,
          reason: evaluated.reason,
          ...(evaluated.details ? { details: evaluated.details } : {})
        });
      }
      evaluatedRows.push(evaluated.row);
    }
    const refId = resolved.integrationType === 'oauth' ? resolved.ref.sourceId : resolved.ref.profileId;
    const importBindingKey = `sheets:${resolved.integrationType}:${String(refId ?? '')}:${resolved.connectorKey}:${resolved.spreadsheetId}:${resolved.sheetName}`;
    const derivedFields = (
      Object.entries(derivedValidation.derivedConfig)
        .map(([key]) => key)
    );

    const result = await importEvaluatedRowsForCompany(req.companyId, evaluatedRows, 'google_sheets', {
      importBindingKey,
      derivedFields,
      sourceRef: {
        mode: resolved.integrationType,
        profileName: resolved.ref.profileName ?? resolved.ref.sourceName ?? null,
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName,
        sourceId: String(refId ?? ''),
        reason: `Connector import (${resolved.connectorKey})`
      }
    });
    if (!result.ok) {
      return fail(res, ('message' in result.error ? result.error.message : 'Validation failed'), 422, result.error);
    }

    const importedAt = new Date();
    await markConnectorImported({
      companyId: req.companyId,
      integrationType: resolved.integrationType,
      sourceId: resolved.ref.sourceId,
      profileId: resolved.ref.profileId,
      connectorKey: resolved.connectorKey,
      importedAt
    });

    const importJob = await ImportJobModel.create({
      companyId: req.companyId,
      createdBy: req.user.id,
      source: resolved.integrationType === 'oauth' ? 'oauth' : 'service',
      status: 'processing',
      mapping: resolved.mapping,
      transforms: resolved.transformations,
      options: {
        connectorKey: resolved.connectorKey,
        integrationType: resolved.integrationType,
        sourceId: resolved.ref.sourceId,
        profileId: resolved.ref.profileId
      }
    });

    await ImportJobModel.updateOne(
      { _id: importJob._id },
      { $set: { status: 'done', 'options.summary': result.data } }
    );

    return ok(res, {
      jobId: importJob._id.toString(),
      result: {
        ...result.data,
        integrationType: resolved.integrationType,
        connectorKey: resolved.connectorKey,
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName
      },
      ref: resolved.ref
    });
  } catch (error) {
    const message = toSheetsErrorMessage(error);
    return fail(res, message, toSheetsErrorStatus(error));
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

export const getPosTrend = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = posTrendQuerySchema.safeParse(req.query ?? {});
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
  })
    .select('date totalSales creditCard cash gas lottery')
    .sort({ date: 1 });

  if (parsed.data.granularity === 'weekly') {
    const weekly = new Map<
      string,
      {
        label: string;
        range: string;
        sortKey: number;
        totalSales: number;
        creditCard: number;
        cash: number;
        gas: number;
        lottery: number;
      }
    >();

    for (const row of rows) {
      const date = startOfUtcDay(row.date);
      const { week, year } = getIsoWeekUtc(date);
      const monday = getMondayUtc(date);
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);
      const key = `${year}-${String(week).padStart(2, '0')}`;
      const bucket = weekly.get(key) ?? {
        label: `Week ${week} ${year}`,
        range: `${monday.toISOString().slice(0, 10)} to ${sunday.toISOString().slice(0, 10)}`,
        sortKey: monday.getTime(),
        totalSales: 0,
        creditCard: 0,
        cash: 0,
        gas: 0,
        lottery: 0
      };
      bucket.totalSales += Number(row.totalSales ?? 0);
      bucket.creditCard += Number(row.creditCard ?? 0);
      bucket.cash += Number(row.cash ?? 0);
      bucket.gas += Number(row.gas ?? 0);
      bucket.lottery += Number(row.lottery ?? 0);
      weekly.set(key, bucket);
    }

    const data = Array.from(weekly.values())
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ sortKey: _sortKey, ...entry }) => entry);

    return ok(res, {
      granularity: 'weekly',
      data,
      start: bounds.startIso,
      end: bounds.endIso
    });
  }

  const data = rows.map((row) => ({
    x: row.date.toISOString(),
    totalSales: Number(row.totalSales ?? 0),
    creditCard: Number(row.creditCard ?? 0),
    cash: Number(row.cash ?? 0),
    gas: Number(row.gas ?? 0),
    lottery: Number(row.lottery ?? 0)
  }));

  return ok(res, {
    granularity: 'daily',
    data,
    start: bounds.startIso,
    end: bounds.endIso
  });
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
  const aggregateFilter = {
    ...filter,
    companyId: toAggregateCompanyId(req.companyId)
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
      { $match: aggregateFilter },
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
  const aggregateFilter = {
    ...filter,
    companyId: toAggregateCompanyId(req.companyId)
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
      { $match: aggregateFilter },
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
      { $match: aggregateFilter },
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
