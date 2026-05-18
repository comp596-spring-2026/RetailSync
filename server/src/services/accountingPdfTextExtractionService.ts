import type {
  CheckRegionCandidate,
  StatementPageObservation
} from './accountingStatementOcrService';
import {
  buildPageTextFromLines,
  extractPdfTextItemsFromBuffer,
  groupItemsIntoLines
} from '../statement-extraction/offline/extractText';

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
    raw: { source: 'pdf.js-extract' },
    checkRegions
  }) as unknown as StatementPageTextObservation;

export const extractStatementPagesFromPdfBuffer = async (
  pdfBuffer: Buffer
): Promise<StatementPageTextObservation[]> => {
  const items = await extractPdfTextItemsFromBuffer(pdfBuffer);
  const lines = groupItemsIntoLines(items);
  const pageText = buildPageTextFromLines(lines);

  return pageText.map((page) => emptyVisionLikePage(page.pageNumber, page.text));
};
