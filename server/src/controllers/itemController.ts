import { barcodeSearchSchema, itemCreateSchema, itemUpdateSchema } from '@retailsync/shared';
import { parse } from 'csv-parse/sync';
import { Request, Response } from 'express';
import { ItemModel } from '../models/Item';
import { LocationModel } from '../models/Location';
import { fail, ok } from '../utils/apiResponse';

type CsvRow = Record<string, string | undefined>;

const normalizeBarcode = (upc: string, modifier?: string) => `${upc.trim()}${(modifier ?? '').trim()}`;

const toNumber = (value: string | undefined) => {
  if (!value) return 0;
  const parsed = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
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

export const listItems = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const barcodeQuery = barcodeSearchSchema.safeParse(req.query);
  const filter = barcodeQuery.success
    ? { companyId: req.companyId, barcode: barcodeQuery.data.barcode }
    : { companyId: req.companyId };

  const items = await ItemModel.find(filter).populate('defaultLocationId', 'code label type').sort({ createdAt: -1 });
  return ok(res, items);
};

export const createItem = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = itemCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  let defaultLocationId: string | null = null;
  if (parsed.data.defaultLocationCode) {
    const location = await LocationModel.findOne({ companyId: req.companyId, code: parsed.data.defaultLocationCode });
    if (!location) {
      return fail(res, 'Default location not found', 404);
    }
    defaultLocationId = location._id.toString();
  }

  const item = await ItemModel.create({
    companyId: req.companyId,
    upc: parsed.data.upc,
    modifier: parsed.data.modifier,
    description: parsed.data.description,
    department: parsed.data.department,
    price: parsed.data.price,
    sku: parsed.data.sku ?? '',
    barcode: normalizeBarcode(parsed.data.upc, parsed.data.modifier),
    defaultLocationId
  });

  return ok(res, item, 201);
};

export const updateItem = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const parsed = itemUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const existing = await ItemModel.findOne({ _id: req.params.id, companyId: req.companyId });
  if (!existing) return fail(res, 'Item not found', 404);

  let defaultLocationId = existing.defaultLocationId;
  if (parsed.data.defaultLocationCode) {
    const location = await LocationModel.findOne({ companyId: req.companyId, code: parsed.data.defaultLocationCode });
    if (!location) return fail(res, 'Default location not found', 404);
    defaultLocationId = location._id;
  }

  const nextUpc = parsed.data.upc ?? existing.upc;
  const nextModifier = parsed.data.modifier ?? existing.modifier;

  existing.upc = nextUpc;
  existing.modifier = nextModifier;
  existing.description = parsed.data.description ?? existing.description;
  existing.department = parsed.data.department ?? existing.department;
  existing.price = parsed.data.price ?? existing.price;
  existing.sku = parsed.data.sku ?? existing.sku;
  existing.defaultLocationId = defaultLocationId;
  existing.barcode = normalizeBarcode(nextUpc, nextModifier);

  await existing.save();
  return ok(res, existing);
};

export const deleteItem = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);

  const deleted = await ItemModel.findOneAndDelete({ _id: req.params.id, companyId: req.companyId });
  if (!deleted) return fail(res, 'Item not found', 404);

  return ok(res, { deleted: true });
};

export const importItemsCsv = async (req: Request, res: Response) => {
  if (!req.companyId) return fail(res, 'Company onboarding required', 403);
  if (!req.file) return fail(res, 'CSV file is required', 400);

  const rows = parse(req.file.buffer.toString('utf8'), {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as CsvRow[];

  const normalized = rows.map((row) => {
    const upc = pick(row, ['UPC', 'upc']);
    const modifier = pick(row, ['MODIFIER', 'modifier']) ?? '';
    const description = pick(row, ['DESCRIPTION', 'description']);
    const department = pick(row, ['DEPARTMENT', 'department']) ?? 'general';
    const price = toNumber(pick(row, ['PRICE', 'price']));
    const sku = pick(row, ['SKU', 'sku']) ?? '';

    return itemCreateSchema.safeParse({ upc, modifier, description, department, price, sku });
  });

  const invalid = normalized.findIndex((result) => !result.success);
  if (invalid >= 0) {
    return fail(res, 'Validation failed', 422, {
      rowIndex: invalid,
      issues: normalized[invalid].success ? undefined : normalized[invalid].error.flatten()
    });
  }

  const validRows = normalized
    .filter((entry): entry is { success: true; data: { upc: string; modifier: string; description: string; department: string; price: number; sku?: string } } => entry.success)
    .map((entry) => entry.data);

  if (!validRows.length) return fail(res, 'No valid rows found', 400);

  const ops = validRows.map((row) => {
    const barcode = normalizeBarcode(row.upc, row.modifier);
    return {
      updateOne: {
        filter: { companyId: req.companyId, barcode },
        update: {
          $set: {
            companyId: req.companyId,
            upc: row.upc,
            modifier: row.modifier,
            description: row.description,
            department: row.department,
            price: row.price,
            sku: row.sku ?? '',
            barcode
          }
        },
        upsert: true
      }
    };
  });

  const result = await ItemModel.bulkWrite(ops as any);
  return ok(res, {
    imported: validRows.length,
    upserted: result.upsertedCount,
    modified: result.modifiedCount
  });
};
