import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCheckCropPath,
  buildCheckOcrPath,
  buildCheckStructuredPath,
  buildOcrPath,
  buildPageImagePath,
  buildStatementPdfPath,
  buildStatementRootPrefix,
  buildStatementOcrTextPath
} from '../services/accountingStorageService';
import {
  detectStatementMonthFromPdf,
  extractPdfFallbackText
} from '../services/accountingPdfAnalysisService';
import { renderStatementPdfPages } from '../services/accountingPdfRenderService';
import { extractStatementPagesFromPdfBuffer } from '../services/accountingPdfTextExtractionService';
import { runStatementCheckExtraction } from '../services/accountingCheckExtractionService';
import type { CheckCropBox } from '../services/accountingCheckCropService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const fixturePdfPath = path.resolve(repoRoot, 'shared/src/accounting/testStatmentPDF.pdf');
const outputRoot = path.resolve(repoRoot, 'server/tmp/statement-fixture-output');

const ensureDir = async (filePath: string) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const writeBuffer = async (filePath: string, value: Buffer) => {
  await ensureDir(filePath);
  await fs.writeFile(filePath, value);
};

const writeText = async (filePath: string, value: string) => {
  await ensureDir(filePath);
  await fs.writeFile(filePath, value, 'utf8');
};

const writeJson = async (filePath: string, value: unknown) => {
  await writeText(filePath, JSON.stringify(value, null, 2));
};

const toLocalPath = (objectPath: string) => path.join(outputRoot, objectPath);

const buildJsonPath = (rootPrefix: string, suffix: string) => buildOcrPath(rootPrefix, `json/${suffix}`);
const buildCheckImageAliasPath = (rootPrefix: string, fileName: string) => `${rootPrefix}/derived/checks/images/${fileName}`;

const MANUAL_CHECK_LAYOUT_PRESETS: Record<number, {
  columns: number;
  rows: number;
  left: number;
  right: number;
  rowTop: number;
  rowHeight: number;
  rowGap: number;
}> = {
  4: { columns: 3, rows: 6, left: 97, right: 1160, rowTop: 137, rowHeight: 155, rowGap: 86 },
  5: { columns: 3, rows: 6, left: 97, right: 1160, rowTop: 137, rowHeight: 155, rowGap: 86 },
  6: { columns: 3, rows: 6, left: 97, right: 1160, rowTop: 137, rowHeight: 155, rowGap: 86 }
};

const TRANSACTION_SECTION_HEADERS = [
  'Deposits',
  'Electronic Credits',
  'Other Credits',
  'Electronic Debits',
  'Checks Cleared',
  'Account Summary'
] as const;

const normalizeDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const yearRaw = slash[3] ? slash[3] : new Date().getFullYear().toString();
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
};

const compactText = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim();

const splitPageLines = (value: string) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((line) => compactText(line))
    .filter(Boolean);

const extractCheckNumbers = (text: string) => {
  const seen = new Set<string>();
  const numbers: string[] = [];
  for (const match of compactText(text).matchAll(/#\s*0*(\d{2,4})\b/g)) {
    const normalized = match[1].padStart(4, '0');
    if (normalized === '0000') continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    numbers.push(normalized);
  }
  return numbers;
};

const extractChecksClearedTable = (text: string, pageNumber: number) => {
  const normalized = compactText(text);
  const rows = Array.from(
    normalized.matchAll(/\b(\d{2,4})\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+\$?(\d[\d,]*\.\d{2})\b/g)
  ).map((match) => ({
    pageNumber,
    checkNumber: match[1].padStart(4, '0'),
    date: normalizeDate(match[2]),
    amount: Number(match[3].replace(/,/g, '')),
    source: 'checks_cleared_table'
  }));

  const deduped = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    deduped.set(`${row.checkNumber}:${row.date}:${row.amount}`, row);
  }
  return [...deduped.values()];
};

const extractTransactionSections = (text: string, pageNumber: number) => {
  const lines = splitPageLines(text);
  const sections: Array<{ pageNumber: number; heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const heading = TRANSACTION_SECTION_HEADERS.find((value) => line.toLowerCase() === value.toLowerCase());
    if (heading) {
      if (current) {
        sections.push({
          pageNumber,
          heading: current.heading,
          lines: current.lines
        });
      }
      current = { heading, lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push({
      pageNumber,
      heading: current.heading,
      lines: current.lines
    });
  }

  return sections;
};

const parseTransactions = (rawText: string) => {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 500);

  const pattern =
    /(?<date>\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?).*?(?<amount>-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2}))/;
  const checkPattern = /check\s*#?\s*(\d{2,8})/i;

  return lines.flatMap((line, index) => {
    const match = line.match(pattern);
    if (!match?.groups) return [];

    const amountRaw = match.groups.amount.replace(/[$,]/g, '');
    const amountNumeric = Number(amountRaw);
    if (!Number.isFinite(amountNumeric)) return [];

    const checkMatch = line.match(checkPattern);
    const checkNumber = checkMatch ? String(checkMatch[1]) : undefined;

    const description = line.slice(0, 140);
    const merchant = description
      .replace(match.groups.date, '')
      .replace(match.groups.amount, '')
      .trim()
      .slice(0, 80);

    return [{
      localId: `txn-${index + 1}`,
      postDate: normalizeDate(match.groups.date),
      description,
      merchant,
      amount: Math.abs(amountNumeric),
      type: amountNumeric < 0 ? 'debit' : 'credit',
      checkNumber,
      sourceLocator: { rowIndex: index }
    }];
  });
};

const parseTransactionsFromPage = (text: string, pageNumber: number) =>
  parseTransactions(text).map((row) => ({
    ...row,
    pageNumber
  }));

const readPngDimensions = (buffer: Buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20)
});

const buildManualCheckCropBoxes = (args: {
  pageNumber: number;
  checkNumbers: string[];
}) => {
  const preset = MANUAL_CHECK_LAYOUT_PRESETS[args.pageNumber];
  if (!preset) return [];

  const sortedCheckNumbers = [...args.checkNumbers]
    .filter((value) => value !== '0000')
    .sort((left, right) => Number(left) - Number(right));

  const totalWidth = preset.right - preset.left;
  const cellWidth = Math.floor(totalWidth / preset.columns);

  return sortedCheckNumbers.slice(0, preset.columns * preset.rows).map((checkNumber, index) => {
    const row = Math.floor(index / preset.columns);
    const column = index % preset.columns;
    const left = preset.left + column * cellWidth;
    const right = column === preset.columns - 1 ? preset.right : preset.left + (column + 1) * cellWidth;
    const top = preset.rowTop + row * (preset.rowHeight + preset.rowGap);
    const bottom = top + preset.rowHeight;

    return {
      checkNumber,
      bbox: {
        left,
        top,
        right,
        bottom
      }
    };
  });
};

const classifyPage = (text: string) => {
  const normalized = compactText(text);
  const checkNumbers = extractCheckNumbers(normalized);
  const amountCount = (normalized.match(/\$\d[\d,]*\.\d{2}/g) ?? []).length;
  const hasChecksClearedTable = /checks cleared/i.test(normalized);
  const hasTransactionSignals =
    /deposits|electronic credits|electronic debits|other credits|account summary|description/i.test(normalized);
  const likelyCheckImagePage = !hasChecksClearedTable && checkNumbers.length >= 4 && amountCount >= 4;

  return {
    isCheckPage: likelyCheckImagePage,
    isChecksTablePage: hasChecksClearedTable,
    isTransactionPage: hasTransactionSignals,
    checkNumbers,
    amountCount
  };
};

const main = async () => {
  const pdfBuffer = await fs.readFile(fixturePdfPath);
  const detection = detectStatementMonthFromPdf({
    pdfBuffer,
    fileName: path.basename(fixturePdfPath)
  });
  const statementMonth = detection.statementMonth ?? '2025-12';
  const statementId = 'fixture-statement';
  const companyId = 'fixture-company';
  const rootPrefix = buildStatementRootPrefix({
    companyId,
    statementMonth,
    statementId
  });
  const pdfObjectPath = buildStatementPdfPath(rootPrefix);
  const pdfLocalPath = toLocalPath(pdfObjectPath);

  await fs.rm(outputRoot, { recursive: true, force: true });
  await writeBuffer(pdfLocalPath, pdfBuffer);

  const fallbackText = extractPdfFallbackText(pdfBuffer);
  const ocrTextPath = buildStatementOcrTextPath(rootPrefix, 'text.txt');
  await writeText(toLocalPath(ocrTextPath), fallbackText);

  const renderedPages = await renderStatementPdfPages({
    pdfBuffer,
    fileName: path.basename(fixturePdfPath)
  });

  const pageArtifacts = await Promise.all(
    renderedPages.map(async (page) => {
      const objectPath = buildPageImagePath(rootPrefix, page.pageNo);
      await writeBuffer(toLocalPath(objectPath), page.buffer);
      return {
        pageNo: page.pageNo,
        objectPath,
        localPath: toLocalPath(objectPath)
      };
    })
  );

  const transactions = parseTransactions(fallbackText);

  let statementOcr:
    | {
        status: 'ok';
        observationsPath: string;
        observations: unknown[];
      }
    | {
        status: 'unavailable';
        error: string;
      };

  let pageObservations: Awaited<ReturnType<typeof extractStatementPagesFromPdfBuffer>> = [];

  try {
    pageObservations = await extractStatementPagesFromPdfBuffer(pdfBuffer);
    const observationsPath = buildOcrPath(rootPrefix, 'statement-pages.ocr.json');
    await writeJson(toLocalPath(observationsPath), pageObservations);
    statementOcr = {
      status: 'ok',
      observationsPath,
      observations: pageObservations.map((page) => ({
        pageNumber: page.pageNumber,
        textLength: page.text.length,
        blocks: page.blocks.length,
        paragraphs: page.paragraphs.length,
        words: page.words.length,
        checkRegions: page.checkRegions
      }))
    };
  } catch (error) {
    statementOcr = {
      status: 'unavailable',
      error: error instanceof Error ? error.message : String(error)
    };
  }

  const pageJsonRows: unknown[] = [];
  const transactionPages: unknown[] = [];
  const checksClearedRows: unknown[] = [];
  const transactionSections: unknown[] = [];
  const pageClassificationByNumber = new Map<number, ReturnType<typeof classifyPage>>();

  for (const page of pageObservations) {
    const pageClass = classifyPage(page.text);
    pageClassificationByNumber.set(page.pageNumber, pageClass);
    const pageTransactions = pageClass.isTransactionPage ? parseTransactionsFromPage(page.text, page.pageNumber) : [];
    const pageChecksCleared = pageClass.isChecksTablePage ? extractChecksClearedTable(page.text, page.pageNumber) : [];
    const pageSections = extractTransactionSections(page.text, page.pageNumber);
    const pageJson = {
      pageNumber: page.pageNumber,
      classification: pageClass,
      textLength: page.text.length,
      checkRegionCount: (page.checkRegions ?? []).length,
      transactionCount: pageTransactions.length,
      checksClearedCount: pageChecksCleared.length,
      sectionCount: pageSections.length,
      lines: splitPageLines(page.text),
      transactions: pageTransactions,
      checksCleared: pageChecksCleared,
      sections: pageSections
    };
    const pageJsonPath = buildJsonPath(rootPrefix, `pages/page-${String(page.pageNumber).padStart(3, '0')}.json`);
    await writeJson(toLocalPath(pageJsonPath), pageJson);
    pageJsonRows.push({
      pageNumber: page.pageNumber,
      jsonPath: pageJsonPath,
      classification: pageClass
    });
    transactionPages.push(...pageTransactions);
    checksClearedRows.push(...pageChecksCleared);
    transactionSections.push(...pageSections);
  }

  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/transactions.json')), transactionPages);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/checks-cleared.json')), checksClearedRows);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/transaction-sections.json')), transactionSections);

  const extractedChecks: unknown[] = [];
  const renderedPageMap = new Map(renderedPages.map((page) => [page.pageNo, page]));
  const checkPages = pageObservations.filter((page) => pageClassificationByNumber.get(page.pageNumber)?.isCheckPage);

  for (const page of checkPages) {
    const renderedPage = renderedPageMap.get(page.pageNumber);
    if (!renderedPage) continue;

    const pageCheckNumbers = pageClassificationByNumber.get(page.pageNumber)?.checkNumbers ?? [];
    const manualChecks = buildManualCheckCropBoxes({
      pageNumber: page.pageNumber,
      checkNumbers: pageCheckNumbers
    });

    for (const anchoredCheck of manualChecks) {
      const pageCheckNumber = anchoredCheck.checkNumber;
      const checkKey = `check_${pageCheckNumber}`;
      const cropPath = buildCheckImageAliasPath(rootPrefix, `${checkKey}.png`);
      const ocrTextPath = buildCheckOcrPath(rootPrefix, checkKey, 'ocr.txt');
      const ocrJsonPath = buildCheckOcrPath(rootPrefix, checkKey, 'ocr.json');
      const structuredPath = buildCheckStructuredPath(rootPrefix, checkKey);
      try {
        const result = await runStatementCheckExtraction({
          pdfBuffer,
          pageNumber: page.pageNumber,
          cropBox: anchoredCheck.bbox,
          checkKey,
          pageContext: page.text,
          internalPdfPageText: page.text,
          persistArtifacts: false
        });

        await writeBuffer(toLocalPath(cropPath), result.crop.buffer);
        await writeText(toLocalPath(ocrTextPath), result.ocr.text);
        await writeJson(toLocalPath(ocrJsonPath), {
          pageNumber: page.pageNumber,
          expectedCheckNumber: pageCheckNumber,
          bbox: anchoredCheck.bbox,
          ocr: result.ocr,
          extracted: result.extracted,
          reasons: result.reasons,
          confidence: result.confidence
        });
        await writeJson(toLocalPath(structuredPath), {
          schemaVersion: 'v1',
          pageNumber: page.pageNumber,
          expectedCheckNumber: pageCheckNumber,
          bbox: anchoredCheck.bbox,
          extracted: result.extracted,
          reasons: result.reasons,
          confidence: result.confidence
        });

        extractedChecks.push({
          mode: 'manual_layout',
          checkKey,
          expectedCheckNumber: pageCheckNumber,
          pageNumber: page.pageNumber,
          bbox: anchoredCheck.bbox,
          extracted: result.extracted,
          reasons: result.reasons,
          confidence: result.confidence,
          artifacts: {
            cropPath,
            ocrTextPath,
            ocrJsonPath,
            structuredPath
          }
        });
      } catch (error) {
        extractedChecks.push({
          mode: 'manual_layout',
          checkKey,
          expectedCheckNumber: pageCheckNumber,
          pageNumber: page.pageNumber,
          bbox: anchoredCheck.bbox,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/extracted-checks.json')), extractedChecks);

  const summaryPath = buildOcrPath(rootPrefix, 'fixture-summary.v1.json');
  const summary = {
    fixturePdfPath,
    outputRoot,
    rootPrefix,
    statement: {
      companyId,
      statementId,
      statementMonth,
      detection,
      pdfObjectPath,
      renderedPages: pageArtifacts,
      fallbackTextPath: ocrTextPath
    },
    transactions,
    pageJsonRows,
    tableJsonPaths: {
      transactions: buildJsonPath(rootPrefix, 'tables/transactions.json'),
      checksCleared: buildJsonPath(rootPrefix, 'tables/checks-cleared.json'),
      transactionSections: buildJsonPath(rootPrefix, 'tables/transaction-sections.json'),
      extractedChecks: buildJsonPath(rootPrefix, 'tables/extracted-checks.json')
    },
    statementOcr,
    manualCheckLayouts: MANUAL_CHECK_LAYOUT_PRESETS,
    extractedChecks
  };

  await writeJson(toLocalPath(summaryPath), summary);

  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify(
      {
        status: 'ok',
        summaryPath,
        summaryLocalPath: toLocalPath(summaryPath),
        outputRoot,
        statementMonth,
        renderedPageCount: renderedPages.length,
        extractedCheckCount: extractedChecks.length,
        statementOcrStatus: statementOcr.status
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify(
      {
        status: 'error',
        message: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
