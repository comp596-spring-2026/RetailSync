import { PosDailySummaryInput, posDailyQuerySchema, posDailySummarySchema } from '@retailsync/shared';
import { parse } from 'csv-parse/sync';
import { Request, Response } from 'express';
import XLSX from 'xlsx';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { fail, ok } from '../utils/apiResponse';

type CsvRow = Record<string, string | undefined>;

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

const importRowsForCompany = async (companyId: string, rawRows: CsvRow[]) => {
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
        update: { $set: { ...row, date } },
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
  const result = await importRowsForCompany(req.companyId, rows);
  if (!result.ok) {
    return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
  }

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
  const result = await importRowsForCompany(req.companyId, rows);
  if (!result.ok) {
    return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
  }

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

  const result = await importRowsForCompany(req.companyId, parsedRows);
  if (!result.ok) {
    return fail(res, result.error.message ?? 'Validation failed', 422, result.error);
  }

  return ok(res, result.data);
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
