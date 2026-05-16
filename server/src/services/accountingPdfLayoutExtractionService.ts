export type StatementPageLayoutItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName?: string;
};

export type StatementPageLayoutObservation = {
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  items: StatementPageLayoutItem[];
};

export type StatementPageSectionBounds = {
  pageNumber: number;
  section: string;
  yStart: number;
  yEnd: number;
  headerText: string;
};

export type ExtractedCheckRow = {
  checkNumber: string;
  date: string | null;
  amount: number;
  pageNumber: number;
  y: number;
  columnIndex: number;
};

export type ExtractedDailyBalance = {
  date: string;
  amount: number;
  pageNumber: number;
  y: number;
  columnIndex: number;
};

// Anchor headers so paragraph text containing the same words elsewhere (e.g. the
// disclosures page mentioning "daily balance" inline) does not register as a section.
const SECTION_HEADER_PATTERNS: Array<{ key: string; match: RegExp }> = [
  { key: 'account_summary', match: /^account\s+summary(\s+\(continued\))?$/i },
  { key: 'deposits', match: /^deposits(\s+\(continued\))?$/i },
  { key: 'electronic_credits', match: /^electronic\s+(deposits|credits)(\s+\(continued\))?$/i },
  { key: 'other_credits', match: /^other\s+credits(\s+\(continued\))?$/i },
  { key: 'electronic_debits', match: /^electronic\s+debits(\s+\(continued\))?$/i },
  { key: 'checks_cleared', match: /^checks\s+(cleared|paid)(\s+\(continued\))?$/i },
  { key: 'daily_balances', match: /^daily\s+balances?(\s+\(continued\))?$/i }
];

// pdf.js-extract is ESM-only and ships a CJS wrapper that resolves to a Promise
// of the PDFExtract class. Cache the resolved class to avoid re-importing it.
let pdfExtractClassPromise:
  | Promise<new () => {
      extractBuffer: (
        buffer: Buffer,
        options?: Record<string, unknown>
      ) => Promise<{
        pages: Array<{
          info?: { num?: number; width?: number; height?: number };
          pageInfo?: { num?: number; width?: number; height?: number };
          content: Array<{
            str?: string;
            x?: number;
            y?: number;
            width?: number;
            height?: number;
            font?: { name?: string };
            fontName?: string;
          }>;
        }>;
      }>;
    }>
  | null = null;

const loadPdfExtractClass = () => {
  if (!pdfExtractClassPromise) {
    pdfExtractClassPromise = import('pdf.js-extract').then(
      (mod) => (mod as any).PDFExtract ?? (mod as any).default
    );
  }
  return pdfExtractClassPromise;
};

/**
 * Extract text items with coordinates from a PDF buffer using pdf.js-extract
 * (Mozilla PDF.js). This is the coordinate-aware extractor strategy; the
 * pdf-parse strategy in `accountingPdfTextExtractionService` remains the default
 * for plain-text extraction and OCR handoff.
 */
export const extractStatementPagesLayoutFromPdfBuffer = async (
  pdfBuffer: Buffer
): Promise<StatementPageLayoutObservation[]> => {
  const PdfExtractClass = await loadPdfExtractClass();
  const extractor = new PdfExtractClass();
  const data = await extractor.extractBuffer(pdfBuffer, {});
  return (data.pages ?? []).map((page, index) => {
    const info = (page.info ?? page.pageInfo) as
      | { num?: number; width?: number; height?: number }
      | undefined;
    return {
      pageNumber: Number(info?.num ?? index + 1),
      pageWidth: Number(info?.width ?? 0),
      pageHeight: Number(info?.height ?? 0),
      items: (page.content ?? [])
        .filter((item) => typeof item.str === 'string' && (item.str ?? '').length > 0)
        .map((item) => ({
          text: String(item.str ?? ''),
          x: Number(item.x ?? 0),
          y: Number(item.y ?? 0),
          width: Number(item.width ?? 0),
          height: Number(item.height ?? 0),
          fontName: item.font?.name ?? item.fontName
        }))
    };
  });
};

/**
 * Derive vertical Y bounds for each recognised statement section by matching header
 * text within the layout items. This lets callers map a transaction row to the
 * section it physically lives in, avoiding misclassification when text chunks are
 * shared between neighbouring sections.
 */
export const deriveSectionBoundsFromLayout = (
  pages: StatementPageLayoutObservation[]
): StatementPageSectionBounds[] => {
  const bounds: StatementPageSectionBounds[] = [];

  for (const page of pages) {
    const headerHits: Array<{ section: string; y: number; text: string }> = [];

    for (const item of page.items) {
      for (const header of SECTION_HEADER_PATTERNS) {
        if (header.match.test(item.text)) {
          headerHits.push({ section: header.key, y: item.y, text: item.text });
        }
      }
    }

    if (headerHits.length === 0) continue;

    headerHits.sort((a, b) => a.y - b.y);
    for (let index = 0; index < headerHits.length; index += 1) {
      const current = headerHits[index];
      const next = headerHits[index + 1];
      bounds.push({
        pageNumber: page.pageNumber,
        section: current.section,
        yStart: current.y,
        yEnd: next ? next.y : page.pageHeight || current.y + 10000,
        headerText: current.text
      });
    }
  }

  return bounds;
};

const parseLayoutAmount = (raw: string): number | null => {
  const cleaned = raw.replace(/[$,\s]/g, '').replace(/[()]/g, '');
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
};

const parseLayoutDate = (raw: string): string | null => {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const [, mm, dd, yyRaw] = m;
  const yy = yyRaw.length === 2 ? `20${yyRaw}` : yyRaw;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
};

// Group layout items by their Y-coordinate (row) so two-column tables can be
// decomposed into per-row entries. Items whose Y differs by less than
// `yTolerance` are considered to share a row.
const groupItemsByRow = (
  items: StatementPageLayoutItem[],
  yTolerance = 1.5
): StatementPageLayoutItem[][] => {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const rows: StatementPageLayoutItem[][] = [];
  let current: StatementPageLayoutItem[] = [];
  let currentY = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    if (!current.length || Math.abs(item.y - currentY) <= yTolerance) {
      current.push(item);
      currentY = current.length === 1 ? item.y : currentY;
    } else {
      rows.push(current.sort((a, b) => a.x - b.x));
      current = [item];
      currentY = item.y;
    }
  }
  if (current.length) rows.push(current.sort((a, b) => a.x - b.x));
  return rows;
};

const CHECK_NUMBER_TOKEN = /^\*?\s*\d{2,6}\*?$/;
const DATE_TOKEN = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const AMOUNT_TOKEN = /^\$?-?\d[\d,]*\.\d{2}$/;
const HEADER_TOKEN = /^(check\s+nbr|date|amount|daily\s+balances?)$/i;
const FOOTNOTE_TOKEN = /indicates skipped|item\(s\) totaling/i;

/**
 * Extract the Checks Cleared table from the coordinate layout. The section is
 * arranged as two columns of (Check Nbr, Date, Amount). The parser walks each
 * row left-to-right and emits a check row every time it has collected a
 * (number, date, amount) triple — this handles any number of columns.
 */
export const extractChecksClearedFromLayout = (
  pages: StatementPageLayoutObservation[],
  sectionBounds: StatementPageSectionBounds[]
): ExtractedCheckRow[] => {
  const out: ExtractedCheckRow[] = [];
  const checkBounds = sectionBounds.filter((bound) => bound.section === 'checks_cleared');
  if (checkBounds.length === 0) return out;

  for (const bound of checkBounds) {
    const page = pages.find((entry) => entry.pageNumber === bound.pageNumber);
    if (!page) continue;
    const inRange = page.items.filter((item) => {
      if (item.y < bound.yStart || item.y >= bound.yEnd) return false;
      const trimmed = item.text.trim();
      if (!trimmed) return false;
      if (HEADER_TOKEN.test(trimmed)) return false;
      if (FOOTNOTE_TOKEN.test(trimmed)) return false;
      return true;
    });
    const rows = groupItemsByRow(inRange);
    for (const row of rows) {
      let pendingNumber: StatementPageLayoutItem | null = null;
      let pendingDate: StatementPageLayoutItem | null = null;
      let columnCursor = 0;
      for (const item of row) {
        const trimmed = item.text.trim();
        if (CHECK_NUMBER_TOKEN.test(trimmed) && !DATE_TOKEN.test(trimmed) && !AMOUNT_TOKEN.test(trimmed)) {
          pendingNumber = item;
          pendingDate = null;
          continue;
        }
        if (DATE_TOKEN.test(trimmed)) {
          pendingDate = item;
          continue;
        }
        if (AMOUNT_TOKEN.test(trimmed) && pendingNumber) {
          const amount = parseLayoutAmount(trimmed);
          if (amount != null) {
            const checkNumber = pendingNumber.text.trim().replace(/^\*|\*$/g, '').padStart(4, '0');
            out.push({
              checkNumber,
              date: pendingDate ? parseLayoutDate(pendingDate.text) : null,
              amount,
              pageNumber: page.pageNumber,
              y: pendingNumber.y,
              columnIndex: columnCursor
            });
            columnCursor += 1;
          }
          pendingNumber = null;
          pendingDate = null;
        }
      }
    }
  }

  const seen = new Map<string, ExtractedCheckRow>();
  for (const row of out) {
    const key = `${row.checkNumber}:${row.date}:${row.amount}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()];
};

/**
 * Extract the Daily Balances table from the coordinate layout. Rows are laid
 * out in N date/amount columns (2 or 3 depending on month length). The parser
 * walks left-to-right and emits a balance every time it has collected a
 * (date, amount) pair.
 */
export const extractDailyBalancesFromLayout = (
  pages: StatementPageLayoutObservation[],
  sectionBounds: StatementPageSectionBounds[]
): ExtractedDailyBalance[] => {
  const out: ExtractedDailyBalance[] = [];
  const dailyBounds = sectionBounds.filter((bound) => bound.section === 'daily_balances');
  if (dailyBounds.length === 0) return out;

  for (const bound of dailyBounds) {
    const page = pages.find((entry) => entry.pageNumber === bound.pageNumber);
    if (!page) continue;
    const inRange = page.items.filter((item) => {
      if (item.y < bound.yStart || item.y >= bound.yEnd) return false;
      const trimmed = item.text.trim();
      if (!trimmed) return false;
      if (HEADER_TOKEN.test(trimmed)) return false;
      return true;
    });
    const rows = groupItemsByRow(inRange);
    for (const row of rows) {
      let pendingDate: StatementPageLayoutItem | null = null;
      let columnCursor = 0;
      for (const item of row) {
        const trimmed = item.text.trim();
        if (DATE_TOKEN.test(trimmed)) {
          pendingDate = item;
          continue;
        }
        if (AMOUNT_TOKEN.test(trimmed) && pendingDate) {
          const date = parseLayoutDate(pendingDate.text);
          const amount = parseLayoutAmount(trimmed);
          if (date && amount != null) {
            out.push({
              date,
              amount,
              pageNumber: page.pageNumber,
              y: pendingDate.y,
              columnIndex: columnCursor
            });
            columnCursor += 1;
          }
          pendingDate = null;
        }
      }
    }
  }

  const seen = new Map<string, ExtractedDailyBalance>();
  for (const row of out) {
    const key = `${row.date}:${row.amount}`;
    if (!seen.has(key)) seen.set(key, row);
  }
  return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
};
