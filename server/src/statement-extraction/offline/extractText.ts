import fs from 'node:fs/promises';
import type { GroupedPdfLine, PdfTextItem } from './types';

type ExtractedPdfPage = {
  info?: { num?: number };
  pageInfo?: { num?: number };
  content: Array<{
    str?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
};

type PdfExtractShape = {
  extract: (filePath: string, options?: Record<string, unknown>) => Promise<{ pages: ExtractedPdfPage[] }>;
  extractBuffer: (buffer: Buffer, options?: Record<string, unknown>) => Promise<{ pages: ExtractedPdfPage[] }>;
};

let pdfExtractClassPromise: Promise<new () => PdfExtractShape> | null = null;

const loadPdfExtractClass = () => {
  if (!pdfExtractClassPromise) {
    pdfExtractClassPromise = import('pdf.js-extract').then(
      (mod) => (mod as unknown as { PDFExtract?: new () => PdfExtractShape; default?: new () => PdfExtractShape }).PDFExtract
        ?? (mod as unknown as { PDFExtract?: new () => PdfExtractShape; default?: new () => PdfExtractShape }).default
        ?? (() => {
          throw new Error('pdf.js-extract did not expose PDFExtract');
        })()
    );
  }
  return pdfExtractClassPromise;
};

const mapPagesToItems = (pages: ExtractedPdfPage[]): PdfTextItem[] =>
  (pages ?? []).flatMap((page, pageIndex) =>
    (page.content ?? [])
      .filter((item) => typeof item.str === 'string' && String(item.str).trim().length > 0)
      .map((item) => ({
        text: String(item.str ?? ''),
        page: Number(page.info?.num ?? page.pageInfo?.num ?? pageIndex + 1),
        x: Number(item.x ?? 0),
        y: Number(item.y ?? 0),
        width: Number(item.width ?? 0),
        height: Number(item.height ?? 0)
      }))
  );

export const extractPdfTextItems = async (pdfPath: string): Promise<PdfTextItem[]> => {
  const PdfExtract = await loadPdfExtractClass();
  const extractor = new PdfExtract();
  const data = await extractor.extract(pdfPath, { disableWorker: true });
  return mapPagesToItems(data.pages ?? []);
};

export const extractPdfTextItemsFromBuffer = async (pdfBuffer: Buffer): Promise<PdfTextItem[]> => {
  const PdfExtract = await loadPdfExtractClass();
  const extractor = new PdfExtract();
  const data = await extractor.extractBuffer(pdfBuffer, { disableWorker: true });
  return mapPagesToItems(data.pages ?? []);
};

export const extractPdfTextItemsFromFileBuffer = async (pdfPath: string): Promise<PdfTextItem[]> =>
  extractPdfTextItemsFromBuffer(await fs.readFile(pdfPath));

const mergeRowText = (items: PdfTextItem[]) => {
  const sorted = [...items].sort((left, right) => left.x - right.x);
  const tokens: string[] = [];
  let previousRight = 0;

  for (const item of sorted) {
    const gap = item.x - previousRight;
    if (tokens.length > 0 && gap > Math.max(2, item.height * 0.35)) {
      tokens.push(' ');
    }
    tokens.push(item.text);
    previousRight = item.x + item.width;
  }

  return tokens.join('').replace(/\s+/g, ' ').trim();
};

export const groupItemsIntoLines = (items: PdfTextItem[], yTolerance = 2.25): GroupedPdfLine[] => {
  const sorted = [...items].sort((left, right) =>
    left.page - right.page || left.y - right.y || left.x - right.x
  );
  const lines: GroupedPdfLine[] = [];

  for (const item of sorted) {
    const existing = [...lines]
      .reverse()
      .find((line) => line.page === item.page && Math.abs(line.y - item.y) <= yTolerance);

    if (existing) {
      existing.items.push(item);
      existing.y = Math.min(existing.y, item.y);
      const right = Math.max(existing.bbox.left + existing.bbox.width, item.x + item.width);
      const bottom = Math.max(existing.bbox.top + existing.bbox.height, item.y + item.height);
      existing.bbox = {
        left: Math.min(existing.bbox.left, item.x),
        top: Math.min(existing.bbox.top, item.y),
        width: right - Math.min(existing.bbox.left, item.x),
        height: bottom - Math.min(existing.bbox.top, item.y)
      };
      existing.text = mergeRowText(existing.items);
      continue;
    }

    lines.push({
      page: item.page,
      y: item.y,
      text: item.text.trim(),
      items: [item],
      bbox: {
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height
      }
    });
  }

  return lines
    .map((line) => ({
      ...line,
      items: [...line.items].sort((left, right) => left.x - right.x),
      text: mergeRowText(line.items)
    }))
    .sort((left, right) => left.page - right.page || left.y - right.y || left.bbox.left - right.bbox.left);
};

export const buildPageTextFromLines = (lines: GroupedPdfLine[]) => {
  const byPage = new Map<number, string[]>();
  for (const line of lines) {
    const bucket = byPage.get(line.page) ?? [];
    bucket.push(line.text);
    byPage.set(line.page, bucket);
  }

  return [...byPage.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([page, pageLines]) => ({
      pageNumber: page,
      text: pageLines.join('\n')
    }));
};
