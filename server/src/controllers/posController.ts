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

const TARGET_FIELDS = [
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'cashExpenses',
  'notes'
];

const toNumber = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, '');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
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
  const lottery = toNumber(pick(row, ['LOTTERY SOLD', 'lottery']));
  const creditCard = toNumber(pick(row, ['CREDIT CARD', 'creditCard']));
  const lotteryPayout = toNumber(pick(row, ['LOTTERY PAYOUT CASH', 'lotteryPayout']));
  const cashExpenses = toNumber(pick(row, ['CASH EXPENSES', 'cashExpenses']));
  const notes = pick(row, ['DESCRIPTION', 'notes']) ?? '';

  const totalSales = highTax + lowTax;
  const cash = totalSales - creditCard;
  const cashPayout = lotteryPayout;
  const clTotal = creditCard + lottery;

  return {
    date,
    day: dayFromDate(date),
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

const getSharedSheetsSourceForCompany = async (companyId: string) => {
  const settings = await IntegrationSettingsModel.findOne({ companyId }).lean();
  const sharedConfig = settings?.googleSheets?.sharedConfig as
    | {
        spreadsheetId?: string | null;
        sheetName?: string | null;
        headerRow?: number | null;
        enabled?: boolean | null;
        columnsMap?: unknown;
        lastMapping?: unknown;
      }
    | undefined;

  const spreadsheetId = sharedConfig?.spreadsheetId?.trim() ?? '';
  const sheetName = sharedConfig?.sheetName?.trim() || 'Sheet1';
  const headerRow = Number(sharedConfig?.headerRow ?? 1);
  const enabled = Boolean(sharedConfig?.enabled);

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
    spreadsheetId,
    sheetName,
    headerRow,
    settingsId: settings?._id?.toString() ?? null,
    mode: settings?.googleSheets?.mode ?? 'service_account'
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
    source: { spreadsheetId, sheetName: selectedTab, headerRow, settingsId: null, mode: opts.authMode === 'oauth' ? 'oauth' : 'service_account' },
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

export const importRowsForCompany = async (companyId: string, rawRows: CsvRow[], importSource: 'file' | 'google_sheets' | 'manual' = 'manual') => {
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
        update: { $set: { ...row, date, source: importSource } },
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
  const result = await importRowsForCompany(req.companyId, rows, 'file');
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
  const result = await importRowsForCompany(req.companyId, rows, 'file');
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

  const result = await importRowsForCompany(req.companyId, parsedRows, 'file');
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

    const normalizeStringRecord = (value: unknown): Record<string, string> => {
      if (!value) return {};
      if (value instanceof Map) return Object.fromEntries(Array.from(value.entries()).map(([k, v]) => [String(k), String(v)]));
      if (typeof value === 'object') {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
      }
      return {};
    };

    const isEmptyRecord = (obj: Record<string, unknown>) => Object.keys(obj).length === 0;

    let effectiveMapping = parsedCommit.data.mapping;
    let effectiveTransforms = parsedCommit.data.transforms ?? {};

    if (isEmptyRecord(effectiveMapping) && source.settingsId) {
      const settings = await IntegrationSettingsModel.findById(source.settingsId).lean();
      const sharedConfig = settings?.googleSheets?.sharedConfig as any;
      const columnsMap = normalizeStringRecord(sharedConfig?.columnsMap);
      const lastMap = normalizeStringRecord(sharedConfig?.lastMapping?.columnsMap);
      effectiveMapping = !isEmptyRecord(columnsMap) ? columnsMap : lastMap;
      if (isEmptyRecord(effectiveTransforms)) {
        effectiveTransforms =
          (sharedConfig?.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {};
      }
    }

    if (isEmptyRecord(effectiveMapping)) {
      return fail(res, 'No saved field mapping found. Map columns first, then import.', 400);
    }

    const mappedRows = parsedRows.map((row) => {
      const out: Record<string, string | undefined> = { ...row };
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

    const result = await importRowsForCompany(req.companyId, mappedRows, 'google_sheets');
    if (!result.ok) {
      return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
    }

    const settingsIdToUpdate = source.settingsId
      ? source.settingsId
      : (await IntegrationSettingsModel.findOne({ companyId: req.companyId }).select('_id').lean())?._id?.toString() ?? null;

    if (settingsIdToUpdate) {
      const setSheetFromCommit = selectedSpreadsheetId
        ? {
            'googleSheets.sharedConfig.spreadsheetId': selectedSpreadsheetId,
            'googleSheets.sharedConfig.sheetName': source.sheetName,
            'googleSheets.sharedConfig.headerRow': source.headerRow,
            'googleSheets.sharedConfig.enabled': true
          }
        : {};

      await IntegrationSettingsModel.updateOne(
        { _id: settingsIdToUpdate },
        {
          $set: {
            'googleSheets.sharedConfig.lastImportAt': new Date(),
            'googleSheets.sharedConfig.columnsMap': effectiveMapping,
            'googleSheets.sharedConfig.lastMapping': {
              columnsMap: effectiveMapping,
              transformations: effectiveTransforms,
              createdAt: new Date(),
              createdBy: req.user.id
            },
            ...setSheetFromCommit,
            'googleSheets.connected': true,
            'googleSheets.updatedAt': new Date(),
            lastImportSource: 'google_sheets',
            lastImportAt: new Date()
          }
        }
      );
    }

    const importJob = await ImportJobModel.create({
      companyId: req.companyId,
      createdBy: req.user.id,
      source: source.mode === 'oauth' ? 'oauth' : 'service',
      status: 'queued',
      mapping: effectiveMapping,
      transforms: effectiveTransforms,
      options: parsedCommit.data.options ?? {}
    });

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
