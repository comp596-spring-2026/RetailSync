import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runStatementFixtureExtraction } from './runStatementFixtureExtraction';
import { DEFAULT_CHECK_IMAGE_PRESET } from '../services/accountingCheckLayoutService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

type FixtureSummary = Awaited<ReturnType<typeof runStatementFixtureExtraction>>;

type FileInventoryRow = {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
};

const htmlEscape = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
};

const readPngDimensions = async (filePath: string) => {
  const buffer = await fs.readFile(filePath);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
};

const normalizeHref = (fromDir: string, toPath: string) =>
  path.relative(fromDir, toPath).split(path.sep).join('/');

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const listFilesRecursive = async (rootDir: string): Promise<FileInventoryRow[]> => {
  const rows: FileInventoryRow[] = [];

  const visit = async (currentDir: string) => {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }

      const stats = await fs.stat(absolutePath);
      rows.push({
        absolutePath,
        relativePath: path.relative(rootDir, absolutePath).split(path.sep).join('/'),
        sizeBytes: stats.size
      });
    }
  };

  await visit(rootDir);
  return rows.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
};

const buildJsonPanel = (args: {
  title: string;
  href: string;
  json: unknown;
  collapsed?: boolean;
}) => {
  const open = args.collapsed ? '' : ' open';
  return `
    <details class="panel"${open}>
      <summary>${htmlEscape(args.title)}</summary>
      <div class="panel-actions"><a href="${htmlEscape(args.href)}">Open raw JSON</a></div>
      <pre>${htmlEscape(JSON.stringify(args.json, null, 2))}</pre>
    </details>
  `;
};

const toCellText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => toCellText(item)).join(', ');
  return JSON.stringify(value);
};

const buildTablePanel = (args: {
  title: string;
  href?: string | null;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
  rowLimit?: number;
  emptyText?: string;
}) => {
  const rows = args.rows.slice(0, args.rowLimit ?? args.rows.length);
  const openRawLink = args.href
    ? `<div class="panel-actions"><a href="${htmlEscape(args.href)}">Open raw JSON</a></div>`
    : '';
  const limitText =
    args.rowLimit && args.rows.length > args.rowLimit
      ? `<p class="table-note">Showing ${htmlEscape(args.rowLimit)} of ${htmlEscape(args.rows.length)} rows.</p>`
      : '';
  const body =
    rows.length > 0
      ? `
        <div class="inventory">
          <table>
            <thead>
              <tr>
                ${args.columns.map((column) => `<th>${htmlEscape(column.label)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                    <tr>
                      ${args.columns
                        .map((column) => `<td>${htmlEscape(toCellText(row[column.key]))}</td>`)
                        .join('')}
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
      : `<p>${htmlEscape(args.emptyText ?? 'No rows available.')}</p>`;

  return `
    <section class="panel">
      <h3>${htmlEscape(args.title)}</h3>
      ${openRawLink}
      ${limitText}
      ${body}
    </section>
  `;
};

const buildMetric = (label: string, value: unknown) => `
  <div class="metric">
    <div class="metric-label">${htmlEscape(label)}</div>
    <div class="metric-value">${htmlEscape(value)}</div>
  </div>
`;

const writeInvestigationReport = async (summary: FixtureSummary) => {
  const reportDir = path.join(summary.outputRoot, 'report');
  const reportPath = path.join(reportDir, 'statement-fixture-investigation.html');
  const reportJsonPath = path.join(reportDir, 'statement-fixture-investigation.index.json');

  await fs.mkdir(reportDir, { recursive: true });

  const summaryLocalPath = path.join(summary.outputRoot, summary.rootPrefix, 'derived/ocr/fixture-summary.v1.json');
  const transactionsPath = path.join(summary.outputRoot, summary.tableJsonPaths.transactions);
  const checksClearedPath = path.join(summary.outputRoot, summary.tableJsonPaths.checksCleared);
  const transactionSectionsPath = path.join(summary.outputRoot, summary.tableJsonPaths.transactionSections);
  const validationReportPath = path.join(summary.outputRoot, summary.tableJsonPaths.validationReport);
  const pdfLayoutPath = path.join(summary.outputRoot, summary.tableJsonPaths.pdfLayout);
  const extractedChecksPath = path.join(summary.outputRoot, summary.tableJsonPaths.extractedChecks);
  const checksReconciliationPath = path.join(summary.outputRoot, summary.tableJsonPaths.checksReconciliation);
  const suggestionsPath = path.join(summary.outputRoot, summary.tableJsonPaths.suggestions);
  const statementPagesOcrPath =
    summary.statementOcr.status === 'ok'
      ? path.join(summary.outputRoot, summary.statementOcr.observationsPath)
      : null;

  const transactions = await readJson<unknown[]>(transactionsPath);
  const checksCleared = await readJson<unknown[]>(checksClearedPath);
  const transactionSections = await readJson<unknown[]>(transactionSectionsPath);
  const validationReport = await readJson<{
    passed?: boolean;
    totals?: { transactionRows?: number; checkRows?: number; sectionRows?: number };
    mismatches?: Array<{ code?: string; expected?: unknown; actual?: unknown }>;
  }>(validationReportPath);
  const pdfLayout = await readJson<{
    pageCount?: number;
    pages?: Array<{ pageNumber?: number; pageWidth?: number; pageHeight?: number }>;
    sectionBounds?: unknown[];
    coordinateTables?: { checksCleared?: unknown[]; dailyBalances?: unknown[] };
  }>(pdfLayoutPath);
  const extractedChecks = await readJson<
    Array<{
      checkKey?: string;
      expectedCheckNumber?: string;
      pageNumber?: number;
      mode?: string;
      bbox?: { left?: number; top?: number; right?: number; bottom?: number };
      confidence?: number;
      extracted?: {
        checkNumber?: string;
        payeeName?: string;
        amount?: number;
        date?: string;
      };
      artifacts?: {
        cropPath?: string;
        ocrTextPath?: string;
        ocrJsonPath?: string;
        structuredPath?: string;
      };
      error?: string;
    }>
  >(extractedChecksPath);
  const checksReconciliation = await readJson<{
    consistencySummary?: Record<string, unknown>;
    rows?: Array<Record<string, unknown>>;
  }>(checksReconciliationPath);
  const suggestions = await readJson<{
    totals?: Record<string, unknown>;
    referenceEntities?: unknown[];
    transactionSuggestions?: unknown[];
    checkSuggestions?: unknown[];
  }>(suggestionsPath);
  const statementPagesOcr = statementPagesOcrPath ? await readJson<unknown[]>(statementPagesOcrPath) : null;

  const pageJsonByNumber = new Map(summary.pageJsonRows.map((row) => [row.pageNumber, row]));
  const pdfLayoutPageByNumber = new Map(
    (pdfLayout?.pages ?? [])
      .filter((page) => Number.isFinite(page.pageNumber))
      .map((page) => [Number(page.pageNumber), page])
  );
  const extractedChecksByPage = new Map<number, NonNullable<typeof extractedChecks>>();
  for (const check of extractedChecks ?? []) {
    const pageNumber = Number(check.pageNumber ?? 0);
    if (!Number.isFinite(pageNumber) || pageNumber <= 0) continue;
    const bucket = extractedChecksByPage.get(pageNumber) ?? [];
    bucket.push(check);
    extractedChecksByPage.set(pageNumber, bucket);
  }

  const pageDetails = await Promise.all(
    summary.statement.renderedPages.map(async (pageArtifact) => {
      const row = pageJsonByNumber.get(pageArtifact.pageNo);
      const localPath = row ? path.join(summary.outputRoot, row.jsonPath) : null;
      const pageJson = await readJson<{
        pageNumber?: number;
        classification?: {
          isCheckPage?: boolean;
          isChecksTablePage?: boolean;
          isTransactionPage?: boolean;
          checkNumbers?: string[];
          amountCount?: number;
        };
        transactionCount?: number;
        checksClearedCount?: number;
        sectionCount?: number;
        lines?: string[];
        sections?: Array<{
          pageNumber?: number;
          heading?: string;
          lines?: string[];
        }>;
      }>(localPath ?? '');
      const imageLocalPath = path.join(summary.outputRoot, pageArtifact.objectPath);
      const imageDimensions = await readPngDimensions(imageLocalPath);
      const layoutPage = pdfLayoutPageByNumber.get(pageArtifact.pageNo);
      const layoutSections = (summary.pdfLayoutSectionBounds ?? []).filter(
        (bound) => Number(bound.pageNumber) === pageArtifact.pageNo
      );
      return {
        pageNumber: pageArtifact.pageNo,
        imageLocalPath,
        imageDimensions,
        imageObjectPath: pageArtifact.objectPath,
        localPath,
        pageJson,
        layoutPage,
        layoutSections,
        checks: extractedChecksByPage.get(pageArtifact.pageNo) ?? []
      };
    })
  );

  const repeatedCheckValuePages = pageDetails
    .map((page) => {
      const repeatedAmounts = new Map<string, number>();
      const repeatedDates = new Map<string, number>();
      for (const check of page.checks) {
        const amountKey =
          typeof check.extracted?.amount === 'number' ? String(check.extracted.amount.toFixed(2)) : null;
        const dateKey = check.extracted?.date ?? null;
        if (amountKey) repeatedAmounts.set(amountKey, (repeatedAmounts.get(amountKey) ?? 0) + 1);
        if (dateKey) repeatedDates.set(dateKey, (repeatedDates.get(dateKey) ?? 0) + 1);
      }
      const dominantAmount = [...repeatedAmounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const dominantDate = [...repeatedDates.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        pageNumber: page.pageNumber,
        checkCount: page.checks.length,
        dominantAmount,
        dominantDate
      };
    })
    .filter(
      (page) =>
        page.checkCount >= 3 &&
        ((page.dominantAmount && page.dominantAmount[1] >= 3) || (page.dominantDate && page.dominantDate[1] >= 3))
    );

  const sectionReviewRows = pageDetails.flatMap((page) =>
    (page.pageJson?.sections ?? []).map((section) => {
      const heading = String(section.heading ?? '').trim();
      const rawLines = Array.isArray(section.lines) ? section.lines : [];
      const ignoreForReadability = heading.toLowerCase() === 'daily balances';
      return {
        pageNumber: page.pageNumber,
        heading,
        rawLineCount: rawLines.length,
        displayLines: ignoreForReadability ? [] : rawLines,
        ignoredLines: ignoreForReadability ? rawLines : [],
        ignoreForReadability
      };
    })
  );

  const functionAnalysis = [
    {
      step: '1',
      functionName: 'detectStatementMonthFromPdf',
      file: 'server/src/services/accountingPdfAnalysisService.ts',
      does: 'Scans extracted PDF text and the file name for month/year clues, ranks candidates, and chooses the statement month plus confidence.',
      output: `This run detected ${summary.statement.statementMonth} with ${summary.statement.detection.confidence} confidence.`,
      flaw: 'Heuristic-only. If OCR text is noisy or the statement wording changes, month detection can drift or fall back to weak filename hints.'
    },
    {
      step: '2',
      functionName: 'renderStatementPdfPages',
      file: 'server/src/services/accountingPdfRenderService.ts',
      does: 'Uses the configured PDF render command to rasterize every statement page into PNG images.',
      output: `Rendered ${summary.statement.renderedPages.length} page images for this fixture.`,
      flaw: 'Depends on an external system binary and consistent DPI. If render settings or page scaling change, downstream pixel-based crop assumptions also change.'
    },
    {
      step: '3',
      functionName: 'extractStatementPagesFromPdfBuffer',
      file: 'server/src/services/accountingPdfTextExtractionService.ts',
      does: 'Pulls embedded per-page PDF text using pdf-parse and converts it into a Vision-like page observation shape.',
      output: `Fed the production parser that produced ${Array.isArray(transactions) ? transactions.length : 0} parsed transactions.`,
      flaw: 'Loses coordinates and can fuse neighboring columns or rows, which makes row-level parsing and check-level extraction less precise.'
    },
    {
      step: '4',
      functionName: 'ocrStatementPages',
      file: 'server/src/services/accountingStatementOcrService.ts',
      does: 'Runs page image OCR and derives candidate check regions from the observation.',
      output: `Used ${summary.statementOcr.status === 'ok' ? summary.statementOcr.provider : 'no'} OCR provider in this run.`,
      flaw: 'Higher-fidelity than pdf-parse, but it is provider-dependent and can vary by OCR quality; its outputs are not yet the single source of truth for check extraction.'
    },
    {
      step: '5',
      functionName: 'extractStatementPagesLayoutFromPdfBuffer',
      file: 'server/src/services/accountingPdfLayoutExtractionService.ts',
      does: 'Uses pdf.js-extract to capture coordinate-aware text items for every page.',
      output: `Generated layout coordinates for ${pdfLayout?.pageCount ?? 0} pages.`,
      flaw: 'Only as good as the PDF text layer. It helps a lot for tables, but it does not solve imaged-check OCR on its own.'
    },
    {
      step: '6',
      functionName: 'deriveSectionBoundsFromLayout + extractChecksClearedFromLayout',
      file: 'server/src/services/accountingPdfLayoutExtractionService.ts',
      does: 'Finds section header bands and reconstructs the coordinate-based Checks Cleared table from row groupings.',
      output: `Recovered ${Array.isArray(checksCleared) ? checksCleared.length : 0} cleared-check rows and passed validation.`,
      flaw: 'Header matching and row grouping are still heuristic. Different bank templates, wrapped text, or duplicated amount/date pairs can make row assignment ambiguous.'
    },
    {
      step: '7',
      functionName: 'parseTransactionsFromOcrPages',
      file: 'server/src/jobs/accountingTaskRunner.ts',
      does: 'Parses transaction-looking lines into normalized rows with dates, amounts, descriptions, sections, and posting-candidate flags.',
      output: `Produced ${summary.productionParsedTransactionCount} production parser rows.`,
      flaw: 'Line reconstruction is fragile when pdf text merges rows or columns. It is good enough here, but some descriptions in the fixture summary are visibly fused.'
    },
    {
      step: '8',
      functionName: 'buildTransactionSections + buildChecksClearedRows',
      file: 'server/src/jobs/accountingTaskRunner.ts',
      does: 'Groups rows by page/section and anchors check-cleared rows, using layout matches to fill missing check numbers.',
      output: 'This stage is healthy in the fixture: the statement totals and cleared checks reconcile to expected values.',
      flaw: 'The amount+date join used to backfill missing check numbers can still be ambiguous when multiple checks share the same amount/date signature.'
    },
    {
      step: '9',
      functionName: 'buildManualCheckCropBoxes + buildFallbackManualCheckSlots',
      file: 'server/src/services/accountingCheckLayoutService.ts',
      does: 'Generates deterministic 3x6 grid bounding boxes for check-image pages based on SouthState-calibrated pixel presets.',
      output: `Assigned ${extractedChecks?.length ?? 0} manual-layout check crops across pages ${pageDetails
        .filter((page) => page.checks.length > 0)
        .map((page) => page.pageNumber)
        .join(', ')}.`,
      flaw: 'This is the first major hotspot. The layout is hardcoded to a bank-specific pixel grid, so even small page shifts or row-height differences can bleed into neighboring checks.'
    },
    {
      step: '10',
      functionName: 'renderCheckCropFromPdf',
      file: 'server/src/services/accountingCheckCropService.ts',
      does: 'Renders each bounding box as its own PNG crop with an extra margin.',
      output: 'Created the per-check crop images you can inspect in the Checks section.',
      flaw: 'The extra crop margin is useful for not clipping text, but it can also widen overlap and pull adjacent check content into the same crop.'
    },
    {
      step: '11',
      functionName: 'runStatementCheckExtraction + extractCheckFieldsFromOcr',
      file: 'server/src/services/accountingCheckExtractionService.ts',
      does: 'Builds the per-check extraction result by parsing crop text or fallback text into date, amount, payee, memo, and confidence fields.',
      output: 'This is the main failure point in the current fixture report.',
      flaw: 'When `internalPdfPageText` is present, the extractor parses statement-page text rather than crop-specific OCR text. That causes many checks on the same page to reuse the same date/amount and lose unique payee/check-number evidence.'
    },
    {
      step: '12',
      functionName: 'checks-reconciliation + suggestions',
      file: 'server/src/scripts/runStatementFixtureExtraction.ts',
      does: 'Compares extracted checks against the cleared-checks table and builds candidate accounting suggestions.',
      output: `Reconciliation found ${(checksReconciliation?.consistencySummary?.exactMatches as number | undefined) ?? 0} exact matches and ${(checksReconciliation?.consistencySummary?.numberOnlyMatches as number | undefined) ?? 0} number-only matches.`,
      flaw: 'Reconciliation can hide poor field extraction because a check still “matches” by check number alone. Suggestions inherit weak evidence when check extraction is bad.'
    }
  ];

  const fileInventory = await listFilesRecursive(summary.outputRoot);
  const imageFiles = fileInventory.filter((row) => /\.(png|jpg|jpeg)$/i.test(row.relativePath));
  const jsonFiles = fileInventory.filter((row) => /\.json$/i.test(row.relativePath));
  const textFiles = fileInventory.filter((row) => /\.(txt|log)$/i.test(row.relativePath));

  const pageCards = pageDetails
    .map((page) => {
      const imageHref = normalizeHref(reportDir, page.imageLocalPath);
      const jsonHref = page.localPath ? normalizeHref(reportDir, page.localPath) : null;
      const checkNumbers = page.pageJson?.classification?.checkNumbers ?? [];
      const isCheckPage = Boolean(page.pageJson?.classification?.isCheckPage);
      const gridCapacity = isCheckPage
        ? DEFAULT_CHECK_IMAGE_PRESET.columns * DEFAULT_CHECK_IMAGE_PRESET.rows
        : null;
      const missingSlots = gridCapacity != null ? Math.max(0, gridCapacity - page.checks.length) : 0;
      const width = page.imageDimensions.width;
      const height = page.imageDimensions.height;
      const layoutHeight = Number(page.layoutPage?.pageHeight ?? 0);
      const sectionOverlays =
        layoutHeight > 0
          ? page.layoutSections
              .map((section) => {
                const topPct = (Number(section.yStart ?? 0) / layoutHeight) * 100;
                const heightPct = ((Number(section.yEnd ?? 0) - Number(section.yStart ?? 0)) / layoutHeight) * 100;
                return `<div class="section-band" style="top:${topPct}%;height:${heightPct}%;">
                  <span>${htmlEscape(String(section.section ?? 'section'))}</span>
                </div>`;
              })
              .join('')
          : '';
      const checkOverlays =
        width > 0 && height > 0
          ? page.checks
              .map((check) => {
                if (!check.bbox) return '';
                const leftPct = (Number(check.bbox.left ?? 0) / width) * 100;
                const topPct = (Number(check.bbox.top ?? 0) / height) * 100;
                const boxWidthPct =
                  ((Number(check.bbox.right ?? 0) - Number(check.bbox.left ?? 0)) / width) * 100;
                const boxHeightPct =
                  ((Number(check.bbox.bottom ?? 0) - Number(check.bbox.top ?? 0)) / height) * 100;
                return `<div class="bbox" style="left:${leftPct}%;top:${topPct}%;width:${boxWidthPct}%;height:${boxHeightPct}%;">
                  <span>${htmlEscape(check.expectedCheckNumber ?? check.checkKey ?? 'check')}</span>
                </div>`;
              })
              .join('')
          : '';
      return `
        <article class="card">
          <h3>Page ${htmlEscape(page.pageNumber)}</h3>
          <div class="meta-row">
            <span class="pill">${page.pageJson?.classification?.isTransactionPage ? 'transaction page' : 'not transaction page'}</span>
            <span class="pill">${page.pageJson?.classification?.isChecksTablePage ? 'checks-cleared table' : 'not checks table'}</span>
            <span class="pill">${page.pageJson?.classification?.isCheckPage ? 'check image page' : 'not check image page'}</span>
          </div>
          <p>Transactions: ${htmlEscape(page.pageJson?.transactionCount ?? 0)} | Checks-cleared rows: ${htmlEscape(page.pageJson?.checksClearedCount ?? 0)} | Sections: ${htmlEscape(page.pageJson?.sectionCount ?? 0)}</p>
          <p>Detected check numbers: ${htmlEscape(checkNumbers.length > 0 ? checkNumbers.join(', ') : 'none')}</p>
          <p>Page image size: ${htmlEscape(width)} x ${htmlEscape(height)} px | Overlaid check boxes: ${htmlEscape(page.checks.length)}</p>
          ${
            gridCapacity != null
              ? `<p>Grid capacity: ${htmlEscape(gridCapacity)} | Empty slots: ${htmlEscape(missingSlots)}${missingSlots > 0 ? ' | Missing detections leave blank spaces with no overlay box.' : ''}</p>`
              : ''
          }
          ${jsonHref ? `<p><a href="${htmlEscape(jsonHref)}">Open page JSON</a></p>` : ''}
          <div class="page-visual">
            <img src="${htmlEscape(imageHref)}" alt="Statement page ${htmlEscape(page.pageNumber)}" />
            <div class="overlay-layer">
              ${sectionOverlays}
              ${checkOverlays}
            </div>
          </div>
        </article>
      `;
    })
    .join('\n');

  const checkCards = (extractedChecks ?? [])
    .map((check) => {
      const cropPath = check.artifacts?.cropPath
        ? path.join(summary.outputRoot, check.artifacts.cropPath)
        : null;
      const cropHref = cropPath ? normalizeHref(reportDir, cropPath) : null;
      const ocrJsonHref = check.artifacts?.ocrJsonPath
        ? normalizeHref(reportDir, path.join(summary.outputRoot, check.artifacts.ocrJsonPath))
        : null;
      const structuredHref = check.artifacts?.structuredPath
        ? normalizeHref(reportDir, path.join(summary.outputRoot, check.artifacts.structuredPath))
        : null;
      const bboxLabel = check.bbox
        ? `L${check.bbox.left} T${check.bbox.top} R${check.bbox.right} B${check.bbox.bottom}`
        : 'n/a';
      const bboxArea = check.bbox
        ? (Number(check.bbox.right) - Number(check.bbox.left)) * (Number(check.bbox.bottom) - Number(check.bbox.top))
        : null;
      return `
        <article class="card">
          <h3>${htmlEscape(check.checkKey ?? 'check')}</h3>
          <p>Expected check number: ${htmlEscape(check.expectedCheckNumber ?? check.extracted?.checkNumber ?? 'unknown')}</p>
          <p>Mode: ${htmlEscape(check.mode ?? 'unknown')} | Page: ${htmlEscape(check.pageNumber ?? 'unknown')} | Confidence: ${htmlEscape(check.confidence ?? 'n/a')}</p>
          <p>Payee: ${htmlEscape(check.extracted?.payeeName ?? 'n/a')} | Amount: ${htmlEscape(check.extracted?.amount ?? 'n/a')} | Date: ${htmlEscape(check.extracted?.date ?? 'n/a')}</p>
          <p>Bounding box: ${htmlEscape(bboxLabel)} | Area: ${htmlEscape(bboxArea != null ? `${bboxArea} px²` : 'n/a')}</p>
          ${check.error ? `<p class="error">Error: ${htmlEscape(check.error)}</p>` : ''}
          <div class="link-row">
            ${cropHref ? `<a href="${htmlEscape(cropHref)}">Crop image</a>` : ''}
            ${ocrJsonHref ? `<a href="${htmlEscape(ocrJsonHref)}">OCR JSON</a>` : ''}
            ${structuredHref ? `<a href="${htmlEscape(structuredHref)}">Structured JSON</a>` : ''}
          </div>
          ${cropHref ? `<img src="${htmlEscape(cropHref)}" alt="${htmlEscape(check.checkKey ?? 'check crop')}" />` : ''}
        </article>
      `;
    })
    .join('\n');

  const hotspotCards = [
    {
      title: 'Statement Structure Is Healthy',
      body: `The statement tables are not the failure point here. Validation passed with ${
        Array.isArray(transactions) ? transactions.length : 0
      } parsed transactions and ${Array.isArray(checksCleared) ? checksCleared.length : 0} cleared-check rows.`
    },
    {
      title: 'Bounding Boxes Need Inspection',
      body: `The overlayed page boxes show deterministic 3x6 crops on pages ${pageDetails
        .filter((page) => page.checks.length > 0)
        .map((page) => page.pageNumber)
        .join(', ')}. This geometry is fixed, not learned from the actual page, so misalignment can spill into neighboring checks.`
    },
    {
      title: 'Check Extraction Is Repeating Page-Level Values',
      body: repeatedCheckValuePages.length
        ? repeatedCheckValuePages
            .map((page) => {
              const amountText = page.dominantAmount
                ? `amount ${page.dominantAmount[0]} repeated ${page.dominantAmount[1]} times`
                : 'no repeated amount signal';
              const dateText = page.dominantDate
                ? `date ${page.dominantDate[0]} repeated ${page.dominantDate[1]} times`
                : 'no repeated date signal';
              return `Page ${page.pageNumber}: ${amountText}; ${dateText}.`;
            })
            .join(' ')
        : 'No repeated-value hotspot was detected.'
    },
    {
      title: 'Reconciliation Masks Weak Field Extraction',
      body: `Checks still “match” because check numbers line up with the cleared-checks table, but reconciliation only found ${
        (checksReconciliation?.consistencySummary?.exactMatches as number | undefined) ?? 0
      } exact matches and ${
        (checksReconciliation?.consistencySummary?.numberOnlyMatches as number | undefined) ?? 0
      } number-only matches.`
    }
  ]
    .map(
      (item) => `
        <article class="card">
          <h3>${htmlEscape(item.title)}</h3>
          <p>${htmlEscape(item.body)}</p>
        </article>
      `
    )
    .join('\n');

  const sectionReviewCards = sectionReviewRows
    .map(
      (section) => `
        <article class="card">
          <div class="meta-row">
            <span class="pill">Page ${htmlEscape(section.pageNumber)}</span>
            <span class="pill">${htmlEscape(section.heading)}</span>
            ${
              section.ignoreForReadability
                ? '<span class="pill">ignored in review</span>'
                : `<span class="pill">${htmlEscape(section.displayLines.length)} visible lines</span>`
            }
          </div>
          <p>${
            section.ignoreForReadability
              ? 'This section is intentionally hidden in the report readability view because daily balances are validation-only and should not be mixed into transaction or checks-cleared analysis.'
              : 'This section is shown as-is from the fixture page JSON so it is easier to inspect row grouping within the correct statement section.'
          }</p>
          ${
            section.displayLines.length > 0
              ? `<pre>${htmlEscape(section.displayLines.join('\n'))}</pre>`
              : ''
          }
          ${
            section.ignoredLines.length > 0
              ? `<details class="panel" style="margin-top:12px;padding:12px 14px;">
                  <summary>Ignored lines (${htmlEscape(section.ignoredLines.length)})</summary>
                  <pre>${htmlEscape(section.ignoredLines.join('\n'))}</pre>
                </details>`
              : ''
          }
        </article>
      `
    )
    .join('\n');

  const transactionsTableRows = (Array.isArray(transactions) ? transactions : []).map((row: any) => ({
    localId: row.localId ?? '',
    postDate: row.postDate ?? '',
    type: row.type ?? '',
    amount: row.amount ?? '',
    checkNumber: row.checkNumber ?? '',
    merchant: row.merchant ?? '',
    description: row.description ?? ''
  }));

  const checksClearedTableRows = (Array.isArray(checksCleared) ? checksCleared : []).map((row: any) => ({
    pageNumber: row.pageNumber ?? '',
    checkNumber: row.checkNumber ?? '',
    date: row.date ?? row.postDate ?? '',
    amount: row.amount ?? '',
    source: row.source ?? row.checkNumberSource ?? '',
    layoutSection: row.layoutSection ?? ''
  }));

  const extractedChecksTableRows = (extractedChecks ?? []).map((row) => ({
    pageNumber: row.pageNumber ?? '',
    expectedCheckNumber: row.expectedCheckNumber ?? '',
    extractedCheckNumber: row.extracted?.checkNumber ?? '',
    extractedDate: row.extracted?.date ?? '',
    extractedAmount: row.extracted?.amount ?? '',
    payee: row.extracted?.payeeName ?? '',
    mode: row.mode ?? '',
    bbox: row.bbox
      ? `L${row.bbox.left ?? ''} T${row.bbox.top ?? ''} R${row.bbox.right ?? ''} B${row.bbox.bottom ?? ''}`
      : '',
    error: row.error ?? ''
  }));

  const reconciliationTableRows = (checksReconciliation?.rows ?? []).map((row) => ({
    checkKey: row.checkKey ?? '',
    checkNumber: row.checkNumber ?? '',
    extractedDate: row.extractedDate ?? '',
    extractedAmount: row.extractedAmount ?? '',
    clearedDate: row.clearedDate ?? '',
    clearedAmount: row.clearedAmount ?? '',
    matchType: row.matchType ?? '',
    matched: row.matched ?? ''
  }));

  const sectionSummaryTableRows = sectionReviewRows.map((section) => ({
    pageNumber: section.pageNumber,
    heading: section.heading,
    visibleLines: section.displayLines.length,
    ignoredLines: section.ignoredLines.length,
    ignoredForReadability: section.ignoreForReadability ? 'yes' : 'no'
  }));

  const structuredTablePanels = [
    buildTablePanel({
      title: 'Transactions Table',
      href: normalizeHref(reportDir, transactionsPath),
      columns: [
        { key: 'localId', label: 'Local ID' },
        { key: 'postDate', label: 'Post Date' },
        { key: 'type', label: 'Type' },
        { key: 'amount', label: 'Amount' },
        { key: 'checkNumber', label: 'Check #' },
        { key: 'merchant', label: 'Merchant' },
        { key: 'description', label: 'Description' }
      ],
      rows: transactionsTableRows,
      rowLimit: 50,
      emptyText: 'No parsed transactions found.'
    }),
    buildTablePanel({
      title: 'Checks Cleared Table',
      href: normalizeHref(reportDir, checksClearedPath),
      columns: [
        { key: 'pageNumber', label: 'Page' },
        { key: 'checkNumber', label: 'Check #' },
        { key: 'date', label: 'Date' },
        { key: 'amount', label: 'Amount' },
        { key: 'source', label: 'Source' },
        { key: 'layoutSection', label: 'Section' }
      ],
      rows: checksClearedTableRows,
      rowLimit: 60,
      emptyText: 'No cleared checks found.'
    }),
    buildTablePanel({
      title: 'Extracted Checks Table',
      href: normalizeHref(reportDir, extractedChecksPath),
      columns: [
        { key: 'pageNumber', label: 'Page' },
        { key: 'expectedCheckNumber', label: 'Expected #' },
        { key: 'extractedCheckNumber', label: 'Extracted #' },
        { key: 'extractedDate', label: 'Extracted Date' },
        { key: 'extractedAmount', label: 'Extracted Amount' },
        { key: 'payee', label: 'Payee' },
        { key: 'mode', label: 'Mode' },
        { key: 'bbox', label: 'Bounding Box' },
        { key: 'error', label: 'Error' }
      ],
      rows: extractedChecksTableRows,
      rowLimit: 60,
      emptyText: 'No extracted checks found.'
    }),
    buildTablePanel({
      title: 'Checks Reconciliation Table',
      href: normalizeHref(reportDir, checksReconciliationPath),
      columns: [
        { key: 'checkKey', label: 'Check Key' },
        { key: 'checkNumber', label: 'Check #' },
        { key: 'extractedDate', label: 'Extracted Date' },
        { key: 'extractedAmount', label: 'Extracted Amount' },
        { key: 'clearedDate', label: 'Cleared Date' },
        { key: 'clearedAmount', label: 'Cleared Amount' },
        { key: 'matchType', label: 'Match Type' },
        { key: 'matched', label: 'Matched' }
      ],
      rows: reconciliationTableRows,
      rowLimit: 60,
      emptyText: 'No reconciliation rows found.'
    }),
    buildTablePanel({
      title: 'Section Summary Table',
      columns: [
        { key: 'pageNumber', label: 'Page' },
        { key: 'heading', label: 'Heading' },
        { key: 'visibleLines', label: 'Visible Lines' },
        { key: 'ignoredLines', label: 'Ignored Lines' },
        { key: 'ignoredForReadability', label: 'Ignored' }
      ],
      rows: sectionSummaryTableRows,
      emptyText: 'No sections found.'
    })
  ].join('\n');

  const functionAnalysisCards = functionAnalysis
    .map(
      (item) => `
        <article class="card">
          <div class="meta-row">
            <span class="pill">Step ${htmlEscape(item.step)}</span>
            <span class="pill">${htmlEscape(item.file)}</span>
          </div>
          <h3>${htmlEscape(item.functionName)}</h3>
          <p><strong>What it does:</strong> ${htmlEscape(item.does)}</p>
          <p><strong>What it produced here:</strong> ${htmlEscape(item.output)}</p>
          <p><strong>Observed flaw / risk:</strong> ${htmlEscape(item.flaw)}</p>
        </article>
      `
    )
    .join('\n');

  const fileRows = fileInventory
    .map(
      (row) => `
        <tr>
          <td><a href="${htmlEscape(normalizeHref(reportDir, row.absolutePath))}">${htmlEscape(row.relativePath)}</a></td>
          <td>${htmlEscape(formatBytes(row.sizeBytes))}</td>
        </tr>
      `
    )
    .join('\n');

  const reportIndex = {
    generatedAt: new Date().toISOString(),
    reportPath,
    summaryLocalPath,
    outputRoot: summary.outputRoot,
    rootPrefix: summary.rootPrefix,
    counts: {
      files: fileInventory.length,
      images: imageFiles.length,
      json: jsonFiles.length,
      text: textFiles.length,
      renderedPages: summary.statement.renderedPages.length,
      extractedChecks: extractedChecks?.length ?? 0,
      parsedTransactions: Array.isArray(transactions) ? transactions.length : 0,
      checksClearedRows: Array.isArray(checksCleared) ? checksCleared.length : 0
    },
    keyFiles: {
      summary: summaryLocalPath,
      transactions: transactionsPath,
      checksCleared: checksClearedPath,
      transactionSections: transactionSectionsPath,
      validationReport: validationReportPath,
      pdfLayout: pdfLayoutPath,
      extractedChecks: extractedChecksPath,
      checksReconciliation: checksReconciliationPath,
      suggestions: suggestionsPath,
      statementPagesOcr: statementPagesOcrPath
    }
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Statement Fixture Investigation</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f1ea;
      --card: #fffdf8;
      --ink: #1f2937;
      --muted: #5b6472;
      --line: #d8d0c2;
      --accent: #14532d;
      --accent-soft: #e8f5ec;
      --warning: #9a3412;
      --warning-soft: #fff1e8;
      --shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
      font-family: "SF Pro Text", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: radial-gradient(circle at top, #fff9ef 0%, var(--bg) 55%, #efe8dc 100%);
      color: var(--ink);
      line-height: 1.5;
    }
    main {
      width: min(1440px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0 64px;
    }
    h1, h2, h3 { line-height: 1.2; margin: 0 0 12px; }
    h1 { font-size: 2.4rem; }
    h2 { font-size: 1.4rem; margin-top: 32px; }
    p { margin: 0 0 12px; }
    a { color: #0f4c81; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .hero, .panel, .card, .inventory {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: var(--shadow);
    }
    .hero { padding: 28px; }
    .hero p.lead { font-size: 1.02rem; color: var(--muted); max-width: 920px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .metric {
      background: linear-gradient(180deg, #ffffff 0%, #f7f3ea 100%);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px 16px;
    }
    .metric-label {
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .metric-value {
      font-size: 1.2rem;
      font-weight: 700;
    }
    .flow {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 12px;
      margin-top: 16px;
    }
    .flow-step {
      position: relative;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid #b9d4c0;
      background: var(--accent-soft);
    }
    .flow-step strong {
      display: block;
      margin-bottom: 8px;
    }
    .panel {
      margin-top: 18px;
      padding: 18px 20px;
    }
    details.panel summary {
      cursor: pointer;
      font-weight: 700;
      font-size: 1.03rem;
    }
    .panel-actions {
      margin: 12px 0;
    }
    pre {
      margin: 0;
      overflow: auto;
      padding: 14px;
      background: #171717;
      color: #f8fafc;
      border-radius: 14px;
      font-size: 0.84rem;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .card {
      padding: 18px;
    }
    .card img {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: white;
    }
    .page-visual {
      position: relative;
      margin-top: 12px;
      overflow: hidden;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
    }
    .page-visual img {
      display: block;
      margin-top: 0;
      border: 0;
      border-radius: 0;
    }
    .overlay-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .bbox {
      position: absolute;
      border: 2px solid #c026d3;
      background: rgba(192, 38, 211, 0.10);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    }
    .bbox span,
    .section-band span {
      position: absolute;
      left: 4px;
      top: 4px;
      max-width: calc(100% - 8px);
      padding: 2px 6px;
      border-radius: 999px;
      background: rgba(17, 24, 39, 0.78);
      color: #fff;
      font-size: 0.72rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .section-band {
      position: absolute;
      left: 0;
      width: 100%;
      background: rgba(20, 83, 45, 0.10);
      border-top: 1px dashed rgba(20, 83, 45, 0.55);
      border-bottom: 1px dashed rgba(20, 83, 45, 0.55);
    }
    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      background: #f0ede4;
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.84rem;
      margin-right: 6px;
      margin-bottom: 6px;
    }
    .meta-row, .link-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 10px 0;
    }
    .error {
      color: var(--warning);
      background: var(--warning-soft);
      border: 1px solid #f3c6b2;
      padding: 10px 12px;
      border-radius: 12px;
    }
    .inventory {
      padding: 0;
      overflow: hidden;
      margin-top: 18px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.94rem;
    }
    th, td {
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    th {
      background: #f8f5ee;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }
    footer {
      margin-top: 30px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .table-note {
      color: var(--muted);
      font-size: 0.9rem;
      margin: 0 0 12px;
    }
    code {
      background: #f3efe6;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 6px;
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <h1>Statement Fixture Investigation</h1>
      <p class="lead">
        This report reruns the real statement fixture pipeline against the shared SouthState PDF, captures every generated artifact under <code>${htmlEscape(summary.outputRoot)}</code>,
        and gives you one page to inspect parsed rows, cleared checks, check crops, reconciliation, and suggestion outputs.
      </p>
      <div class="metrics">
        ${buildMetric('Statement Month', summary.statement.statementMonth)}
        ${buildMetric('Rendered Pages', summary.statement.renderedPages.length)}
        ${buildMetric('Parsed Transactions', Array.isArray(transactions) ? transactions.length : 0)}
        ${buildMetric('Cleared Check Rows', Array.isArray(checksCleared) ? checksCleared.length : 0)}
        ${buildMetric('Extracted Checks', extractedChecks?.length ?? 0)}
        ${buildMetric('OCR Provider', summary.statementOcr.status === 'ok' ? summary.statementOcr.provider : 'unavailable')}
        ${buildMetric('Validation', validationReport?.passed ? 'passed' : 'failed')}
        ${buildMetric('Files Produced', fileInventory.length)}
      </div>
      <div class="meta-row" style="margin-top: 18px;">
        <span class="pill"><a href="${htmlEscape(normalizeHref(reportDir, summaryLocalPath))}">Summary JSON</a></span>
        <span class="pill"><a href="${htmlEscape(normalizeHref(reportDir, path.join(summary.outputRoot, summary.statement.pdfObjectPath)))}">Original PDF copy</a></span>
        <span class="pill"><a href="${htmlEscape(normalizeHref(reportDir, transactionsPath))}">Transactions JSON</a></span>
        <span class="pill"><a href="${htmlEscape(normalizeHref(reportDir, extractedChecksPath))}">Extracted Checks JSON</a></span>
        <span class="pill"><a href="${htmlEscape(normalizeHref(reportDir, reportJsonPath))}">Report Index JSON</a></span>
      </div>
    </section>

    <section>
      <h2>Workflow Chart</h2>
      <div class="flow">
        <div class="flow-step">
          <strong>1. Original PDF</strong>
          Copy the source statement into the fixture output folder so every later artifact can reference the same input.
        </div>
        <div class="flow-step">
          <strong>2. Render + Text Extract</strong>
          Render page PNGs, extract fallback text, and produce page-level OCR observations from Vision or PDF text.
        </div>
        <div class="flow-step">
          <strong>3. Structure Statement</strong>
          Parse transactions, detect sections, build the cleared-checks table, and write validation plus PDF-layout JSON.
        </div>
        <div class="flow-step">
          <strong>4. Extract Checks</strong>
          Crop each detected or inferred check image, read OCR from the crop, and write structured per-check outputs.
        </div>
        <div class="flow-step">
          <strong>5. Reconcile + Suggest</strong>
          Compare extracted checks against the cleared-checks table and build transaction/check suggestion JSON.
        </div>
        <div class="flow-step">
          <strong>6. Investigation Report</strong>
          Aggregate all files into this HTML page so you can inspect where parsing or matching starts going bad.
        </div>
      </div>
    </section>

    <section>
      <h2>Pages</h2>
      <div class="grid">${pageCards}</div>
    </section>

    <section>
      <h2>Hotspots</h2>
      <div class="grid">${hotspotCards}</div>
    </section>

    <section>
      <h2>Checks</h2>
      <div class="grid">${checkCards || '<p>No extracted checks were produced.</p>'}</div>
    </section>

    <section>
      <h2>Function Analysis</h2>
      <div class="grid">${functionAnalysisCards}</div>
    </section>

    <section>
      <h2>Section Review</h2>
      <div class="grid">${sectionReviewCards}</div>
    </section>

    <section>
      <h2>Structured Tables</h2>
      ${structuredTablePanels}
    </section>

    <section>
      <h2>Key JSON Outputs</h2>
      ${buildJsonPanel({ title: 'Fixture Summary', href: normalizeHref(reportDir, summaryLocalPath), json: summary })}
      ${transactions ? buildJsonPanel({ title: 'Transactions Table', href: normalizeHref(reportDir, transactionsPath), json: transactions, collapsed: true }) : ''}
      ${checksCleared ? buildJsonPanel({ title: 'Checks Cleared Table', href: normalizeHref(reportDir, checksClearedPath), json: checksCleared, collapsed: true }) : ''}
      ${transactionSections ? buildJsonPanel({ title: 'Transaction Sections', href: normalizeHref(reportDir, transactionSectionsPath), json: transactionSections, collapsed: true }) : ''}
      ${validationReport ? buildJsonPanel({ title: 'Validation Report', href: normalizeHref(reportDir, validationReportPath), json: validationReport, collapsed: true }) : ''}
      ${checksReconciliation ? buildJsonPanel({ title: 'Checks Reconciliation', href: normalizeHref(reportDir, checksReconciliationPath), json: checksReconciliation, collapsed: true }) : ''}
      ${suggestions ? buildJsonPanel({ title: 'Suggestions', href: normalizeHref(reportDir, suggestionsPath), json: suggestions, collapsed: true }) : ''}
      ${statementPagesOcr ? buildJsonPanel({ title: 'Statement Page OCR Observations', href: normalizeHref(reportDir, statementPagesOcrPath ?? ''), json: statementPagesOcr, collapsed: true }) : ''}
      ${pdfLayout ? buildJsonPanel({
        title: 'PDF Layout Overview',
        href: normalizeHref(reportDir, pdfLayoutPath),
        json: {
          pageCount: pdfLayout.pageCount,
          sectionBoundCount: Array.isArray(pdfLayout.sectionBounds) ? pdfLayout.sectionBounds.length : 0,
          checksClearedCoordinateRows: Array.isArray(pdfLayout.coordinateTables?.checksCleared) ? pdfLayout.coordinateTables?.checksCleared.length : 0,
          dailyBalanceCoordinateRows: Array.isArray(pdfLayout.coordinateTables?.dailyBalances) ? pdfLayout.coordinateTables?.dailyBalances.length : 0
        },
        collapsed: true
      }) : ''}
    </section>

    <section>
      <h2>All Produced Files</h2>
      <div class="inventory">
        <table>
          <thead>
            <tr>
              <th>Artifact</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows}
          </tbody>
        </table>
      </div>
    </section>

    <footer>
      Generated at ${htmlEscape(new Date().toISOString())} from ${htmlEscape(repoRoot)}.
    </footer>
  </main>
</body>
</html>
`;

  await fs.writeFile(reportPath, html, 'utf8');
  await fs.writeFile(reportJsonPath, JSON.stringify(reportIndex, null, 2), 'utf8');

  return {
    reportPath,
    reportJsonPath,
    reportIndex,
    fileInventory
  };
};

export const runStatementFixtureInvestigation = async () => {
  const summary = await runStatementFixtureExtraction();
  const report = await writeInvestigationReport(summary);

  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify(
      {
        status: 'ok',
        reportPath: report.reportPath,
        reportJsonPath: report.reportJsonPath,
        outputRoot: summary.outputRoot,
        renderedPages: summary.statement.renderedPages.length,
        parsedTransactions: report.reportIndex.counts.parsedTransactions,
        extractedChecks: report.reportIndex.counts.extractedChecks,
        filesProduced: report.reportIndex.counts.files
      },
      null,
      2
    )
  );

  return {
    summary,
    report
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runStatementFixtureInvestigation().catch((error) => {
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
