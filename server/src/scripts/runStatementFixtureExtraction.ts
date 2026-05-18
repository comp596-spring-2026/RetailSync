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
import {
  applyLayoutSectionsToParsedTransactions,
  deriveSectionBoundsFromLayout,
  extractChecksClearedFromLayout,
  extractDailyBalancesFromLayout,
  extractStatementPagesLayoutFromPdfBuffer
} from '../services/accountingPdfLayoutExtractionService';
import { ocrStatementPages } from '../services/accountingStatementOcrService';
import { runStatementCheckExtraction } from '../services/accountingCheckExtractionService';
import type { CheckCropBox } from '../services/accountingCheckCropService';
import {
  MANUAL_CHECK_LAYOUT_PRESETS,
  buildManualCheckCropBoxes,
  buildFallbackManualCheckSlots
} from '../services/accountingCheckLayoutService';
import {
  buildChecksClearedRows as buildProductionChecksClearedRows,
  buildExtractionIssues as buildProductionExtractionIssues,
  buildTransactionSections as buildProductionTransactionSections,
  parseTransactionsFromOcrPages as parseProductionTransactionsFromOcrPages
} from '../jobs/accountingTaskRunner';
import { buildStatementValidationReport } from '../services/statementValidationService';

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

const TRANSACTION_SECTION_HEADERS = [
  'Deposits',
  'Electronic Credits',
  'Other Credits',
  'Electronic Debits',
  'Checks Cleared',
  'Daily Balances',
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

const normalizeAmount = (value: string) => Number(value.replace(/[$,()]/g, '').trim());

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
    normalized.matchAll(
      /\b(?:#\s*)?(\d{2,4})\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+\$?(\d[\d,]*\.\d{2})\b/g
    )
  ).map((match) => ({
    pageNumber,
    checkNumber: match[1].padStart(4, '0'),
    date: normalizeDate(match[2]),
    amount: normalizeAmount(match[3]),
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
  const debitHintPattern = /payment|purchase|withdraw|debit|check\s*#|fee|bill\s*pay|ach\s*debit|transfer to/i;
  const creditHintPattern = /deposit|credit|return|refund|transfer from|ach\s*credit|interest/i;

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
    const explicitSignType = amountNumeric < 0 ? 'debit' : null;
    const hintedType = debitHintPattern.test(line)
      ? 'debit'
      : creditHintPattern.test(line)
        ? 'credit'
        : null;
    const txnType = explicitSignType ?? hintedType ?? 'debit';

    return [{
      localId: `txn-${index + 1}`,
      postDate: normalizeDate(match.groups.date),
      description,
      merchant,
      amount: Math.abs(amountNumeric),
      type: txnType,
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

const normalizeForMatch = (value: string) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenOverlapScore = (left: string, right: string) => {
  const leftTokens = new Set(normalizeForMatch(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeForMatch(right).split(' ').filter(Boolean));
  if (!leftTokens.size || !rightTokens.size) return 0;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

const rankEntityCandidates = (params: {
  query: string;
  direction: 'debit' | 'credit';
  references: Array<{ id: string; type: 'vendor' | 'customer'; name: string }>;
}) => {
  const queryNorm = normalizeForMatch(params.query);
  return params.references
    .map((ref) => {
      const refNorm = normalizeForMatch(ref.name);
      let score = tokenOverlapScore(queryNorm, refNorm);
      if (queryNorm && refNorm && (queryNorm.includes(refNorm) || refNorm.includes(queryNorm))) {
        score = Math.max(score, 0.82);
      }
      if (params.direction === 'debit' && ref.type === 'vendor') score += 0.1;
      if (params.direction === 'credit' && ref.type === 'customer') score += 0.1;
      return {
        refId: ref.id,
        refType: ref.type,
        refName: ref.name,
        score: Number(Math.min(0.99, score).toFixed(3))
      };
    })
    .sort((left, right) => right.score - left.score);
};

const GENERIC_ENTITY_TERMS = new Set([
  'deposit',
  'deposits',
  'debit',
  'debits',
  'credit',
  'credits',
  'payment',
  'transfer',
  'online transfer',
  'beginning balance',
  'ending balance',
  'balance',
  'account summary',
  'total'
]);

const cleanEntityCandidateName = (value: string) => {
  const compact = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const noPunctuation = compact.replace(/[^\w\s&.-]/g, '').trim();
  const withoutTrailingAmounts = noPunctuation.replace(/\$?\d[\d,]*\.\d{2}\s*$/g, '').trim();
  return withoutTrailingAmounts;
};

const isUsefulEntityName = (value: string) => {
  const normalized = normalizeForMatch(value);
  if (!normalized) return false;
  if (GENERIC_ENTITY_TERMS.has(normalized)) return false;
  if (/^\d+$/.test(normalized)) return false;
  if (normalized.length < 4) return false;
  return true;
};

const deriveReferenceEntities = (args: {
  transactions: any[];
  checks: any[];
}) => {
  const vendorNames = new Set<string>();
  const customerNames = new Set<string>();

  for (const txn of args.transactions) {
    const direction = txn.type === 'credit' ? 'credit' : 'debit';
    const rawName = String(txn.merchant ?? txn.description ?? '').trim();
    const candidate = cleanEntityCandidateName(rawName);
    if (!isUsefulEntityName(candidate)) continue;
    if (direction === 'debit') vendorNames.add(candidate);
    if (direction === 'credit') customerNames.add(candidate);
  }

  for (const check of args.checks) {
    const payee = cleanEntityCandidateName(String(check?.extracted?.payeeName ?? '').trim());
    if (isUsefulEntityName(payee)) vendorNames.add(payee);
  }

  const references: Array<{ id: string; type: 'vendor' | 'customer'; name: string }> = [];
  let vendorCursor = 1;
  for (const name of [...vendorNames].sort((a, b) => a.localeCompare(b)).slice(0, 60)) {
    references.push({
      id: `vendor-${String(vendorCursor).padStart(3, '0')}`,
      type: 'vendor',
      name
    });
    vendorCursor += 1;
  }

  let customerCursor = 1;
  for (const name of [...customerNames].sort((a, b) => a.localeCompare(b)).slice(0, 60)) {
    references.push({
      id: `customer-${String(customerCursor).padStart(3, '0')}`,
      type: 'customer',
      name
    });
    customerCursor += 1;
  }

  return references;
};

const pickSingleCandidateIfConfident = (
  ranked: Array<{ refId: string; refType: 'vendor' | 'customer'; refName: string; score: number }>
) => {
  const best = ranked[0];
  if (!best) return null;
  const second = ranked[1];
  const scoreThreshold = 0.78;
  const marginThreshold = 0.12;
  const margin = second ? best.score - second.score : best.score;
  return best.score >= scoreThreshold && margin >= marginThreshold ? best : null;
};

export const runStatementFixtureExtraction = async () => {
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
        provider: 'vision' | 'pdf_text';
      }
    | {
        status: 'unavailable';
        error: string;
      };

  let pageObservations: Awaited<ReturnType<typeof extractStatementPagesFromPdfBuffer>> = [];
  let statementOcrProvider: 'vision' | 'pdf_text';

  try {
    try {
      pageObservations = await ocrStatementPages(
        renderedPages.map((page) => ({
          pageNumber: page.pageNo,
          imageBuffer: page.buffer,
          mimeType: 'image/png'
        }))
      );
      statementOcrProvider = 'vision';
    } catch {
      pageObservations = await extractStatementPagesFromPdfBuffer(pdfBuffer);
      statementOcrProvider = 'pdf_text';
    }
    const observationsPath = buildOcrPath(rootPrefix, 'statement-pages.ocr.json');
    await writeJson(toLocalPath(observationsPath), pageObservations);
    statementOcr = {
      status: 'ok',
      observationsPath,
      provider: statementOcrProvider,
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

  const pageJsonRows: any[] = [];
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
  }
  // Coordinate-aware extractor strategy (pdf.js-extract) — compute layout + section bounds first
  // so parser builders can snap to real section boundaries.
  const pdfLayoutPages = await extractStatementPagesLayoutFromPdfBuffer(pdfBuffer);
  const pdfLayoutSectionBounds = deriveSectionBoundsFromLayout(pdfLayoutPages);
  const pdfLayoutChecks = extractChecksClearedFromLayout(pdfLayoutPages, pdfLayoutSectionBounds);
  const pdfLayoutDailyBalances = extractDailyBalancesFromLayout(pdfLayoutPages, pdfLayoutSectionBounds);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/pdf-layout.v1.json')), {
    schemaVersion: 'v1',
    strategy: 'pdf.js-extract',
    pageCount: pdfLayoutPages.length,
    pages: pdfLayoutPages,
    sectionBounds: pdfLayoutSectionBounds,
    coordinateTables: {
      checksCleared: pdfLayoutChecks,
      dailyBalances: pdfLayoutDailyBalances
    }
  });

  // Keep fixture parser inputs aligned with production statement.extract flow (pdf text pages).
  const productionParserPages = await extractStatementPagesFromPdfBuffer(pdfBuffer);
  const productionParsed = parseProductionTransactionsFromOcrPages(
    productionParserPages.map((page) => ({
      ...page,
      checkRegions: []
    })) as any
  );
  applyLayoutSectionsToParsedTransactions(
    productionParsed,
    pdfLayoutPages,
    pdfLayoutSectionBounds
  );
  const normalizedTransactions = productionParsed;
  const normalizedChecksClearedRows = buildProductionChecksClearedRows(
    productionParsed as any,
    pdfLayoutSectionBounds,
    pdfLayoutChecks
  );
  const transactionSections = buildProductionTransactionSections(
    productionParsed as any,
    pdfLayoutSectionBounds
  );
  const extractionIssues = buildProductionExtractionIssues(productionParsed as any);
  const validationReport = buildStatementValidationReport({
    statementId,
    rows: productionParsed as any,
    profile: 'southstate_fixture'
  });

  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/transactions.json')), normalizedTransactions);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/checks-cleared.json')), normalizedChecksClearedRows);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/transaction-sections.json')), transactionSections);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/validation-report.v1.json')), validationReport);

  const extractedChecks: any[] = [];
  const renderedPageMap = new Map(renderedPages.map((page) => [page.pageNo, page]));
  const pageObservationByNumber = new Map(pageObservations.map((page) => [page.pageNumber, page]));
  const checkPages = pageObservations.filter((page) => pageClassificationByNumber.get(page.pageNumber)?.isCheckPage);
  const checksClearedByNumber = new Map(
    normalizedChecksClearedRows
      .filter((row) => typeof row.checkNumber === 'string' && row.checkNumber.trim().length > 0)
      .map((row) => [String(row.checkNumber).padStart(4, '0'), row] as const)
  );

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
        const clearedRow = checksClearedByNumber.get(String(pageCheckNumber).padStart(4, '0'));
        const result = await runStatementCheckExtraction({
          pdfBuffer,
          pageNumber: page.pageNumber,
          cropBox: anchoredCheck.bbox,
          checkKey,
          pageContext: page.text,
          fallback: {
            checkNumber: pageCheckNumber,
            date: clearedRow?.postDate ?? undefined,
            amount: clearedRow?.amount,
            source: 'deterministic'
          },
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

  if (extractedChecks.length === 0 && normalizedChecksClearedRows.length > 0) {
    const deduped = new Map<string, (typeof normalizedChecksClearedRows)[number]>();
    for (const row of normalizedChecksClearedRows) {
      deduped.set(`${row.checkNumber}:${row.postDate}:${row.amount}`, row);
    }
    const dedupedRows = [...deduped.values()];
    const fallbackSlots = buildFallbackManualCheckSlots(dedupedRows.map((row) => String(row.checkNumber)));
    const slotByCheckNumber = new Map<string, { pageNumber: number; checkNumber: string; bbox: CheckCropBox }[]>();
    for (const slot of fallbackSlots) {
      const bucket = slotByCheckNumber.get(slot.checkNumber) ?? [];
      bucket.push(slot);
      slotByCheckNumber.set(slot.checkNumber, bucket);
    }

    for (const row of dedupedRows) {
      const checkKey = `check_${row.checkNumber}`;
      const slot = slotByCheckNumber.get(String(row.checkNumber))?.shift();
      const cropPath = buildCheckImageAliasPath(rootPrefix, `${checkKey}.png`);
      let cropArtifactPath: string | undefined;
      if (slot && renderedPageMap.has(slot.pageNumber)) {
        const pageContext = pageObservationByNumber.get(slot.pageNumber)?.text ?? '';
        const renderedPage = renderedPageMap.get(slot.pageNumber);
        try {
          const cropResult = await runStatementCheckExtraction({
            pdfBuffer,
            pageNumber: slot.pageNumber,
            cropBox: slot.bbox,
            checkKey,
            pageContext,
            fallback: {
              checkNumber: row.checkNumber ?? undefined,
              date: row.postDate ?? undefined,
              amount: row.amount,
              source: 'deterministic'
            },
            internalPdfPageText: pageContext,
            persistArtifacts: false
          });
          await writeBuffer(toLocalPath(cropPath), cropResult.crop.buffer);
          cropArtifactPath = cropPath;
        } catch {
          if (renderedPage) {
            await writeBuffer(toLocalPath(cropPath), renderedPage.buffer);
            cropArtifactPath = cropPath;
          } else {
            cropArtifactPath = undefined;
          }
        }
      }

      extractedChecks.push({
        mode: 'checks_table_fallback',
        checkKey,
        expectedCheckNumber: row.checkNumber,
        pageNumber: slot?.pageNumber ?? row.pageNumber,
        bbox: slot?.bbox,
        extracted: {
          checkNumber: row.checkNumber,
          date: row.postDate,
          amount: row.amount
        },
        reasons: ['derived from checks-cleared or transaction fallback rows'],
        confidence: 0.6,
        artifacts: cropArtifactPath ? { cropPath: cropArtifactPath } : undefined
      });
    }
  }

  if (extractedChecks.length === 0) {
    const fallbackCheckCandidates = [...pageClassificationByNumber.entries()].flatMap(([pageNumber, pageClass]) =>
      pageClass.checkNumbers.map((checkNumber) => ({ pageNumber, checkNumber }))
    );
    const dedupedFallbackChecks = new Map<string, { pageNumber: number; checkNumber: string }>();
    for (const row of fallbackCheckCandidates) {
      dedupedFallbackChecks.set(row.checkNumber, row);
    }
    const fallbackRows = [...dedupedFallbackChecks.values()].slice(0, 100);
    const fallbackSlots = buildFallbackManualCheckSlots(fallbackRows.map((row) => String(row.checkNumber)));
    const slotByCheckNumber = new Map<string, { pageNumber: number; checkNumber: string; bbox: CheckCropBox }[]>();
    for (const slot of fallbackSlots) {
      const bucket = slotByCheckNumber.get(slot.checkNumber) ?? [];
      bucket.push(slot);
      slotByCheckNumber.set(slot.checkNumber, bucket);
    }

    for (const row of fallbackRows) {
      const checkKey = `check_${row.checkNumber}`;
      const slot = slotByCheckNumber.get(String(row.checkNumber))?.shift();
      const cropPath = buildCheckImageAliasPath(rootPrefix, `${checkKey}.png`);
      let cropArtifactPath: string | undefined;
      if (slot && renderedPageMap.has(slot.pageNumber)) {
        const pageContext = pageObservationByNumber.get(slot.pageNumber)?.text ?? '';
        const renderedPage = renderedPageMap.get(slot.pageNumber);
        try {
          const cropResult = await runStatementCheckExtraction({
            pdfBuffer,
            pageNumber: slot.pageNumber,
            cropBox: slot.bbox,
            checkKey,
            pageContext,
            fallback: {
              checkNumber: row.checkNumber ?? undefined,
              source: 'deterministic'
            },
            internalPdfPageText: pageContext,
            persistArtifacts: false
          });
          await writeBuffer(toLocalPath(cropPath), cropResult.crop.buffer);
          cropArtifactPath = cropPath;
        } catch {
          if (renderedPage) {
            await writeBuffer(toLocalPath(cropPath), renderedPage.buffer);
            cropArtifactPath = cropPath;
          } else {
            cropArtifactPath = undefined;
          }
        }
      }

      extractedChecks.push({
        mode: 'page_text_fallback',
        checkKey,
        expectedCheckNumber: row.checkNumber,
        pageNumber: slot?.pageNumber ?? row.pageNumber,
        bbox: slot?.bbox,
        extracted: {
          checkNumber: row.checkNumber
        },
        reasons: ['derived from OCR page text check-number detection'],
        confidence: 0.35,
        artifacts: cropArtifactPath ? { cropPath: cropArtifactPath } : undefined
      });
    }
  }

  const checksByNumber = new Map<string, Array<{ date?: string; amount?: number; source?: string }>>();
  for (const row of normalizedChecksClearedRows) {
    const key = String(row.checkNumber ?? '').padStart(4, '0');
    const bucket = checksByNumber.get(key) ?? [];
    bucket.push({
      date: typeof row.postDate === 'string' ? row.postDate : undefined,
      amount: typeof row.amount === 'number' ? row.amount : undefined,
      source: 'production_parser'
    });
    checksByNumber.set(key, bucket);
  }

  const reconciliationRows = extractedChecks.map((check) => {
    const checkNumber = String(check.expectedCheckNumber ?? check.extracted?.checkNumber ?? '').padStart(4, '0');
    const candidates = checksByNumber.get(checkNumber) ?? [];
    const extractedDate = check.extracted?.date;
    const extractedAmount = typeof check.extracted?.amount === 'number' ? Number(check.extracted.amount) : undefined;

    const exact = candidates.find(
      (candidate) =>
        extractedDate &&
        extractedAmount != null &&
        candidate.date === extractedDate &&
        candidate.amount != null &&
        Math.abs(Number(candidate.amount) - extractedAmount) < 0.01
    );
    const dateOnly = candidates.find((candidate) => extractedDate && candidate.date === extractedDate);
    const amountOnly = candidates.find(
      (candidate) =>
        extractedAmount != null && candidate.amount != null && Math.abs(Number(candidate.amount) - extractedAmount) < 0.01
    );
    const selected = exact ?? dateOnly ?? amountOnly ?? candidates[0];
    const matchType = exact ? 'exact' : dateOnly ? 'date_only' : amountOnly ? 'amount_only' : candidates.length > 0 ? 'number_only' : 'missing';

    return {
      checkKey: check.checkKey,
      checkNumber,
      extractedDate: extractedDate ?? null,
      extractedAmount: extractedAmount ?? null,
      clearedDate: selected?.date ?? null,
      clearedAmount: selected?.amount ?? null,
      clearedSource: selected?.source ?? null,
      matchType,
      dateMatches: Boolean(selected?.date && extractedDate && selected.date === extractedDate),
      amountMatches:
        selected?.amount != null && extractedAmount != null
          ? Math.abs(Number(selected.amount) - extractedAmount) < 0.01
          : false,
      matched: matchType !== 'missing'
    };
  });

  const consistencySummary = {
    totalExtractedChecks: reconciliationRows.length,
    matchedByNumber: reconciliationRows.filter((row) => row.matched).length,
    exactMatches: reconciliationRows.filter((row) => row.matchType === 'exact').length,
    dateOnlyMatches: reconciliationRows.filter((row) => row.matchType === 'date_only').length,
    amountOnlyMatches: reconciliationRows.filter((row) => row.matchType === 'amount_only').length,
    numberOnlyMatches: reconciliationRows.filter((row) => row.matchType === 'number_only').length,
    missingInClearedTable: reconciliationRows.filter((row) => row.matchType === 'missing').length
  };

  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/extracted-checks.json')), extractedChecks);
  await writeJson(toLocalPath(buildJsonPath(rootPrefix, 'tables/checks-reconciliation.json')), {
    generatedAt: new Date().toISOString(),
    consistencySummary,
    rows: reconciliationRows
  });

  const summaryPath = buildOcrPath(rootPrefix, 'fixture-summary.v1.json');
  const referenceEntities = deriveReferenceEntities({
    transactions: normalizedTransactions,
    checks: extractedChecks as any[]
  });

  const transactionSuggestions = normalizedTransactions.map((txn, index) => {
    const query = String(txn.merchant ?? txn.description ?? '').trim();
    const direction = txn.type === 'credit' ? 'credit' : 'debit';
    const ranked = rankEntityCandidates({
      query,
      direction,
      references: referenceEntities
    }).slice(0, 3);
    const selected = pickSingleCandidateIfConfident(ranked);
    return {
      id: `txn-suggestion-${index + 1}`,
      source: 'transaction',
      statementTransactionLocalId: txn.localId ?? `txn-${index + 1}`,
      query,
      amount: txn.amount,
      direction,
      candidates: ranked,
      selected
    };
  });

  const checkSuggestions = extractedChecks.map((check: any, index) => {
    const query = String(check.extracted?.payeeName ?? `Check ${check.expectedCheckNumber ?? index + 1}`).trim();
    const ranked = rankEntityCandidates({
      query,
      direction: 'debit',
      references: referenceEntities
    }).slice(0, 3);
    const selected = pickSingleCandidateIfConfident(ranked);
    return {
      id: `check-suggestion-${index + 1}`,
      source: 'check',
      expectedCheckNumber: check.expectedCheckNumber ?? null,
      query,
      amount: check.extracted?.amount ?? null,
      direction: 'debit',
      candidates: ranked,
      selected
    };
  });

  const suggestionsJsonPath = buildJsonPath(rootPrefix, 'tables/suggestions.json');
  await writeJson(toLocalPath(suggestionsJsonPath), {
    generatedAt: new Date().toISOString(),
    referenceEntities,
    transactionSuggestions,
    checkSuggestions,
    totals: {
      transactionSuggestions: transactionSuggestions.length,
      checkSuggestions: checkSuggestions.length
    }
  });

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
    productionParsedTransactionCount: normalizedTransactions.length,
    extractionIssues,
    validationReport,
    pageJsonRows,
    tableJsonPaths: {
      transactions: buildJsonPath(rootPrefix, 'tables/transactions.json'),
      checksCleared: buildJsonPath(rootPrefix, 'tables/checks-cleared.json'),
      transactionSections: buildJsonPath(rootPrefix, 'tables/transaction-sections.json'),
      validationReport: buildJsonPath(rootPrefix, 'tables/validation-report.v1.json'),
      pdfLayout: buildJsonPath(rootPrefix, 'tables/pdf-layout.v1.json'),
      extractedChecks: buildJsonPath(rootPrefix, 'tables/extracted-checks.json'),
      checksReconciliation: buildJsonPath(rootPrefix, 'tables/checks-reconciliation.json'),
      suggestions: suggestionsJsonPath
    },
    pdfLayoutSectionBounds,
    pdfLayoutChecks,
    pdfLayoutDailyBalances,
    statementOcr,
    manualCheckLayouts: MANUAL_CHECK_LAYOUT_PRESETS,
    extractedChecks
  };

  if (!validationReport.passed) {
    const mismatchSummary = validationReport.mismatches
      .map((mismatch) => `${mismatch.code}: expected=${mismatch.expected} actual=${mismatch.actual}`)
      .join(' | ');
    throw new Error(`SouthState fixture validation failed: ${mismatchSummary}`);
  }

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
        statementOcrStatus: statementOcr.status,
        statementOcrProvider: statementOcr.status === 'ok' ? statementOcr.provider : 'unavailable'
      },
      null,
      2
    )
  );

  return summary;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runStatementFixtureExtraction().catch((error) => {
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
}
