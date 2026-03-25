import { PosDailySummaryInput, posDailySummarySchema } from "@retailsync/shared";
import { parse } from "csv-parse/sync";
import XLSX from "xlsx";
import { ImportJobModel } from "../../models/ImportJob";
import { POSDailySummaryModel } from "../../models/POSDailySummary";
import { getSheetsClientForCompany } from "../../integrations/google/sheets.client";
import { DEFAULT_CONNECTOR_KEY } from "../../integrations/google/connectors";
import { buildFullSheetRange } from "../../integrations/google/sheetsReader";
import {
  resolveActiveSheetsConfig,
  resolveSheetsConfigByRef,
  type ResolvedSheetsConfig,
} from "../../integrations/google/sourceResolver";
import { markConnectorImported } from "../googleSheets/managementService";
import { buildRange, normalizeRows } from "../../utils/sheetsRange";
import {
  evaluateConfiguredPosRow,
  validateDerivedConfiguration,
} from "../../utils/posDerivedEvaluator";
import { computeCompatibilityForConnector } from "../../integrations/google/compatibility";

export type CsvRow = Record<string, string | undefined>;

type ImportSource = "file" | "google_sheets" | "manual";

type PosImportSourceRef = {
  mode?: string | null;
  profileName?: string | null;
  spreadsheetId?: string | null;
  sheetName?: string | null;
  sourceId?: string | null;
  importJobId?: string | null;
  reason?: string | null;
};

type PosImportOptions = {
  importBindingKey?: string | null;
  derivedFields?: string[];
  sourceRef?: PosImportSourceRef;
};

type PosImportResult =
  | {
      ok: true;
      data: {
        imported: number;
        upserted: number;
        modified: number;
      };
    }
  | {
      ok: false;
      error:
        | {
            message: string;
          }
        | {
            rowIndex: number;
            issues: unknown;
          };
    };

const toNumber = (value: string | undefined) => {
  if (!value) return 0;
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const toOptionalNumber = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,\s]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const pick = (row: CsvRow, keys: string[]) => {
  for (const key of keys) {
    const direct = row[key];
    if (direct !== undefined) return direct;
    const found = Object.entries(row).find(
      ([entry]) => entry.trim().toUpperCase() === key.trim().toUpperCase(),
    );
    if (found) return found[1];
  }
  return undefined;
};

const dayFromDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString("en-US", {
    weekday: "short",
    timeZone: "UTC",
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
  const dateValue = pick(row, ["DATE", "date"]);
  if (!dateValue) return null;

  const date = normalizeDate(dateValue);
  if (!date) return null;

  const highTax = toNumber(pick(row, ["HIGH TAX", "highTax"]));
  const lowTax = toNumber(pick(row, ["LOW TAX", "lowTax"]));
  const saleTax = toNumber(pick(row, ["SALE TAX", "saleTax"]));
  const gas = toNumber(pick(row, ["GAS", "gas"]));
  const lottery = toNumber(pick(row, ["LOTTERY SOLD", "LOTTERY", "lottery"]));
  const creditCard = toNumber(pick(row, ["CREDIT CARD", "creditCard"]));
  const lotteryPayout = toNumber(
    pick(row, ["LOTTERY PAYOUT CASH", "LOTTERY PAYOUT", "lotteryPayout"]),
  );
  const mappedCashExpenses = toOptionalNumber(
    pick(row, ["CASH EXPENSES", "CASH EXP.", "CASH PAYOUT", "cashExpenses"]),
  );
  const cashExpenses = mappedCashExpenses ?? 0;
  const notes = pick(row, ["DESCRIPTION", "NOTES", "notes"]) ?? "";

  const mappedDay = pick(row, ["day", "DAY"]);
  const mappedTotalSales = toOptionalNumber(
    pick(row, ["totalSales", "TOTAL SALES"]),
  );
  const mappedCash = toOptionalNumber(pick(row, ["cash", "CASH DIFF"]));
  const mappedClTotal = toOptionalNumber(
    pick(row, ["clTotal", "CL TOTAL", "CREDIT + LOTTERY TOTAL"]),
  );
  const mappedCashPayout = toOptionalNumber(
    pick(row, ["cashPayout", "CASH PAYOUT"]),
  );

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
    notes,
  };
};

const parseRowsWithHeader = (rows: string[][]) => {
  if (rows.length < 2) return [] as CsvRow[];
  const [header, ...body] = rows;
  const normalizedHeader = header.map((cell) => String(cell ?? "").trim());
  return body
    .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0))
    .map((row) => {
      const obj: CsvRow = {};
      normalizedHeader.forEach((column, index) => {
        obj[column] = String(row[index] ?? "");
      });
      return obj;
    });
};

export const parseRowsWithHeaderRow = (rows: string[][], headerRow: number) => {
  if (rows.length < headerRow + 1) return [] as CsvRow[];
  const headerIndex = Math.max(0, headerRow - 1);
  const header = rows[headerIndex];
  const body = rows.slice(headerIndex + 1);
  const normalizedHeader = header.map((cell) => String(cell ?? "").trim());
  return body
    .filter((row) => row.some((cell) => String(cell ?? "").trim().length > 0))
    .map((row) => {
      const obj: CsvRow = {};
      normalizedHeader.forEach((column, index) => {
        obj[column] = String(row[index] ?? "");
      });
      return obj;
    });
};

export const parseCsvFileRows = (buffer: Buffer) => {
  const csv = buffer.toString("utf-8");
  return parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
};

export const parseXlsxRows = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [] as CsvRow[];
  const firstSheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(firstSheet, {
    defval: "",
    raw: false,
  }) as CsvRow[];
};

export const parseInlineRows = (rows: string[][], hasHeader: boolean) =>
  hasHeader ? parseRowsWithHeader(rows) : [];

const resolveLegacyIntegrationType = (source?: string): "oauth" | "shared" | undefined => {
  if (!source) return undefined;
  if (source === "oauth") return "oauth";
  if (source === "service") return "shared";
  return undefined;
};

export const resolveConfigFromRequest = async (
  companyId: string,
  params: {
    integrationType?: "oauth" | "shared";
    sourceId?: string;
    profileId?: string;
    connectorKey?: string;
    source?: string;
  },
) => {
  const integrationType =
    params.integrationType ?? resolveLegacyIntegrationType(params.source);
  const connectorKey =
    String(params.connectorKey ?? "").trim() || DEFAULT_CONNECTOR_KEY;

  if (!integrationType) {
    return resolveActiveSheetsConfig(companyId, connectorKey);
  }

  return resolveSheetsConfigByRef(companyId, {
    integrationType,
    sourceId: params.sourceId,
    profileId: params.profileId,
    connectorKey,
  });
};

export const readRowsForResolvedConfig = async (
  companyId: string,
  resolved: ResolvedSheetsConfig,
  opts?: { limitRows?: number; sheetNameOverride?: string },
) => {
  const authMode = resolved.integrationType === "oauth" ? "oauth" : "service_account";
  const sheets = await getSheetsClientForCompany(authMode, companyId);
  const sheetName =
    String(opts?.sheetNameOverride ?? resolved.sheetName).trim() ||
    resolved.sheetName;
  const limitRows = opts?.limitRows;
  const range =
    typeof limitRows === "number"
      ? buildRange(sheetName, resolved.headerRow, Math.min(Math.max(limitRows, 1), 200))
      : buildFullSheetRange(sheetName, resolved.headerRow);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: resolved.spreadsheetId,
    range,
  });
  const rawRows = normalizeRows(response.data.values as unknown[][] | undefined);
  return {
    rawRows,
    rowCount: rawRows.length,
    sheetName,
  };
};

export const readSharedSheetRows = async (
  companyId: string,
  opts?: { tab?: string; maxRows?: number; profileId?: string; connectorKey?: string },
) => {
  const resolved = await resolveSheetsConfigByRef(companyId, {
    integrationType: "shared",
    profileId: opts?.profileId,
    connectorKey: opts?.connectorKey,
  });
  const { rawRows, rowCount, sheetName } = await readRowsForResolvedConfig(
    companyId,
    resolved,
    {
      limitRows: opts?.maxRows,
      sheetNameOverride: opts?.tab,
    },
  );

  return {
    source: {
      integrationType: "shared" as const,
      connectorKey: resolved.connectorKey,
      profileId: resolved.ref.profileId ?? null,
      profileName: resolved.ref.profileName ?? null,
      spreadsheetId: resolved.spreadsheetId,
      sheetName,
      headerRow: resolved.headerRow,
      mapping: resolved.mapping,
      transformations: resolved.transformations,
    },
    rawRows,
    rowCount,
  };
};

const upsertPosRowsForCompany = async (
  companyId: string,
  normalizedRows: PosDailySummaryInput[],
  importSource: ImportSource,
  opts?: PosImportOptions,
): Promise<PosImportResult> => {
  if (normalizedRows.length === 0) {
    return {
      ok: false,
      error: {
        message: "No valid POS rows found",
      },
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
            derivedFieldsApplied: Array.isArray(opts?.derivedFields)
              ? opts.derivedFields
              : undefined,
            sourceRef: opts?.sourceRef
              ? {
                  mode: opts.sourceRef.mode ?? null,
                  profileName: opts.sourceRef.profileName ?? null,
                  spreadsheetId: opts.sourceRef.spreadsheetId ?? null,
                  sheetName: opts.sourceRef.sheetName ?? null,
                  sourceId: opts.sourceRef.sourceId ?? null,
                  importJobId: opts.sourceRef.importJobId ?? null,
                  reason: opts.sourceRef.reason ?? null,
                }
              : undefined,
          },
        },
        upsert: true,
      },
    };
  });

  const writeResult = await POSDailySummaryModel.bulkWrite(ops as any);

  return {
    ok: true,
    data: {
      imported: normalizedRows.length,
      upserted: writeResult.upsertedCount,
      modified: writeResult.modifiedCount,
    },
  };
};

export const importRowsForCompany = async (
  companyId: string,
  rawRows: CsvRow[],
  importSource: ImportSource = "manual",
  opts?: PosImportOptions,
): Promise<PosImportResult> => {
  const parsedRows = rawRows
    .map(mapRow)
    .filter((row): row is NonNullable<ReturnType<typeof mapRow>> => !!row);
  const validatedRows = parsedRows.map((row, index) => {
    const parsed = posDailySummarySchema.safeParse(row);
    if (!parsed.success) {
      return { index, error: parsed.error.flatten() };
    }
    return { index, data: parsed.data };
  });

  const validationError = validatedRows.find((row) => "error" in row);
  if (validationError && "error" in validationError) {
    return {
      ok: false,
      error: {
        rowIndex: validationError.index,
        issues: validationError.error,
      },
    };
  }

  const normalizedRows = validatedRows.map(
    (row) => (row as { index: number; data: PosDailySummaryInput }).data,
  );
  return upsertPosRowsForCompany(companyId, normalizedRows, importSource, opts);
};

export const importEvaluatedRowsForCompany = async (
  companyId: string,
  rows: PosDailySummaryInput[],
  importSource: ImportSource = "manual",
  opts?: PosImportOptions,
): Promise<PosImportResult> => {
  const validatedRows = rows.map((row, index) => {
    const parsed = posDailySummarySchema.safeParse(row);
    if (!parsed.success) {
      return { index, error: parsed.error.flatten() };
    }
    return { index, data: parsed.data };
  });

  const validationError = validatedRows.find((row) => "error" in row);
  if (validationError && "error" in validationError) {
    return {
      ok: false,
      error: {
        rowIndex: validationError.index,
        issues: validationError.error,
      },
    };
  }

  const normalizedRows = validatedRows.map(
    (row) => (row as { index: number; data: PosDailySummaryInput }).data,
  );
  return upsertPosRowsForCompany(companyId, normalizedRows, importSource, opts);
};

export const commitPosImportFromSheets = async (params: {
  companyId: string;
  userId: string;
  connectorKey: string;
  integrationType?: "oauth" | "shared";
  sourceId?: string;
  profileId?: string;
}) => {
  if (params.connectorKey !== "pos_daily") {
    return {
      ok: false as const,
      statusCode: 400,
      message: "Unsupported connector",
    };
  }

  const resolved =
    params.integrationType != null
      ? await resolveSheetsConfigByRef(params.companyId, {
          integrationType: params.integrationType,
          sourceId: params.sourceId,
          profileId: params.profileId,
          connectorKey: params.connectorKey,
        })
      : await resolveActiveSheetsConfig(params.companyId, params.connectorKey);

  const { rawRows } = await readRowsForResolvedConfig(params.companyId, resolved);
  const columns = rawRows[Math.max(0, resolved.headerRow - 1)] ?? [];
  const compatibility = computeCompatibilityForConnector({
    connectorKey: resolved.connectorKey,
    columns,
    mapping: resolved.mapping,
  });
  if (compatibility.status === "error") {
    return {
      ok: false as const,
      statusCode: 400,
      message: "Connector mapping is not compatible",
      details: compatibility,
    };
  }

  const derivedValidation = validateDerivedConfiguration({
    headers: columns,
    mapping: resolved.mapping,
    transformations: resolved.transformations,
  });
  if (!derivedValidation.ok) {
    return {
      ok: false as const,
      statusCode: 400,
      message: "Derived mapping configuration is invalid",
      details: {
        compatibility,
        derivedValidation,
      },
    };
  }

  const parsedRows = parseRowsWithHeaderRow(rawRows, resolved.headerRow);
  if (parsedRows.length === 0) {
    return {
      ok: false as const,
      statusCode: 400,
      message: "No data rows found in configured sheet",
    };
  }

  const evaluatedRows: PosDailySummaryInput[] = [];
  for (let index = 0; index < parsedRows.length; index += 1) {
    const evaluated = evaluateConfiguredPosRow({
      row: parsedRows[index],
      mapping: resolved.mapping,
      transformations: resolved.transformations,
    });
    if (!evaluated.ok) {
      const sheetRow = resolved.headerRow + index + 1;
      return {
        ok: false as const,
        statusCode: 422,
        message: `Row ${index + 1} (sheet row ${sheetRow}): ${evaluated.reason}`,
        details: {
          rowIndex: index,
          sheetRow,
          reason: evaluated.reason,
          ...(evaluated.details ? { details: evaluated.details } : {}),
        },
      };
    }
    evaluatedRows.push(evaluated.row);
  }

  const refId =
    resolved.integrationType === "oauth"
      ? resolved.ref.sourceId
      : resolved.ref.profileId;
  const importBindingKey = `sheets:${resolved.integrationType}:${String(refId ?? "")}:${resolved.connectorKey}:${resolved.spreadsheetId}:${resolved.sheetName}`;
  const derivedFields = Object.entries(derivedValidation.derivedConfig).map(
    ([key]) => key,
  );

  const result = await importEvaluatedRowsForCompany(
    params.companyId,
    evaluatedRows,
    "google_sheets",
    {
      importBindingKey,
      derivedFields,
      sourceRef: {
        mode: resolved.integrationType,
        profileName: resolved.ref.profileName ?? resolved.ref.sourceName ?? null,
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName,
        sourceId: String(refId ?? ""),
        reason: `Connector import (${resolved.connectorKey})`,
      },
    },
  );
  if (!result.ok) {
    return {
      ok: false as const,
      statusCode: 422,
      message:
        "message" in result.error ? result.error.message : "Validation failed",
      details: result.error,
    };
  }

  const importedAt = new Date();
  await markConnectorImported({
    companyId: params.companyId,
    integrationType: resolved.integrationType,
    sourceId: resolved.ref.sourceId,
    profileId: resolved.ref.profileId,
    connectorKey: resolved.connectorKey,
    importedAt,
  });

  const importJob = await ImportJobModel.create({
    companyId: params.companyId,
    createdBy: params.userId,
    source: resolved.integrationType === "oauth" ? "oauth" : "service",
    status: "processing",
    mapping: resolved.mapping,
    transforms: resolved.transformations,
    options: {
      connectorKey: resolved.connectorKey,
      integrationType: resolved.integrationType,
      sourceId: resolved.ref.sourceId,
      profileId: resolved.ref.profileId,
    },
  });

  await ImportJobModel.updateOne(
    { _id: importJob._id },
    { $set: { status: "done", "options.summary": result.data } },
  );

  return {
    ok: true as const,
    data: {
      jobId: importJob._id.toString(),
      result: {
        ...result.data,
        integrationType: resolved.integrationType,
        connectorKey: resolved.connectorKey,
        spreadsheetId: resolved.spreadsheetId,
        sheetName: resolved.sheetName,
      },
      ref: resolved.ref,
    },
  };
};
