import { createRequire } from 'module';
import type {
  CheckRegionCandidate,
  StatementPageObservation
} from './accountingStatementOcrService';

const require = createRequire(import.meta.url);
// pdf-parse is CommonJS; load via require for ESM server bundle.
const pdfParse = require('pdf-parse') as (data: Buffer) => Promise<{
  numpages: number;
  text: string;
}>;

export type StatementPageTextObservation = StatementPageObservation & {
  checkRegions?: CheckRegionCandidate[];
};

const emptyVisionLikePage = (
  pageNumber: number,
  text: string,
  checkRegions: CheckRegionCandidate[] = []
): StatementPageTextObservation =>
  ({
    provider: 'pdf_text',
    pageNumber,
    text,
    blocks: [],
    paragraphs: [],
    words: [],
    raw: { source: 'pdf-parse' },
    checkRegions
  }) as unknown as StatementPageTextObservation;

/**
 * Extract per-page text from a PDF buffer using embedded text (no cloud OCR).
 * Pages are split on form-feed when pdf-parse provides them; otherwise text is mapped across numpages.
 */
export const extractStatementPagesFromPdfBuffer = async (
  pdfBuffer: Buffer
): Promise<StatementPageTextObservation[]> => {
  const data = await pdfParse(pdfBuffer);
  const numpages = Math.max(1, Number(data.numpages ?? 1));
  const raw = String(data.text ?? '');
  const chunks = raw.split('\f').map((chunk) => chunk.trim());

  if (chunks.length === numpages) {
    return chunks.map((text, index) => emptyVisionLikePage(index + 1, text));
  }

  if (chunks.length === 1 && numpages > 1) {
    return Array.from({ length: numpages }, (_, index) =>
      emptyVisionLikePage(index + 1, index === 0 ? chunks[0] : '')
    );
  }

  const pages: StatementPageTextObservation[] = [];
  for (let index = 0; index < numpages; index += 1) {
    pages.push(emptyVisionLikePage(index + 1, chunks[index] ?? ''));
  }
  return pages;
};
