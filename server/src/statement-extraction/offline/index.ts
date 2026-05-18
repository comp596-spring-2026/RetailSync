import type { ExtractedCheckRow } from '../../services/accountingPdfLayoutExtractionService';
import { extractPdfTextItemsFromBuffer, groupItemsIntoLines } from './extractText';
import { extractChecks } from './extractChecks';
import { parseStatementLines } from './parseStatement';
import type { CheckRow, OfflineStatementExtractionResult } from './types';

export const buildCheckRowsFromLayout = (rows: ExtractedCheckRow[]): CheckRow[] =>
  rows.map((row, index) => ({
    checkNumber: String(row.checkNumber).padStart(4, '0'),
    date: String(row.date ?? ''),
    amount: Number(row.amount ?? 0),
    sourcePage: Number(row.pageNumber ?? 0),
    rowText: `${String(row.checkNumber).padStart(4, '0')} ${row.date ?? ''} ${Number(row.amount ?? 0).toFixed(2)}`,
    bbox: undefined
  }));

export const extractOfflineStatement = async (args: {
  pdfBuffer: Buffer;
  layoutChecks: ExtractedCheckRow[];
  persistCrop: (params: {
    checkNumber: string;
    imageBuffer: Buffer;
    reviewBuffer: Buffer;
  }) => Promise<{ imageCropPath: string; reviewCropPath: string }>;
}): Promise<OfflineStatementExtractionResult> => {
  const textItems = await extractPdfTextItemsFromBuffer(args.pdfBuffer);
  const lines = groupItemsIntoLines(textItems);
  const checkRows = buildCheckRowsFromLayout(args.layoutChecks);
  const parsed = parseStatementLines({
    lines,
    checkRows
  });
  const checks = await extractChecks({
    pdfBuffer: args.pdfBuffer,
    lines,
    checkRows,
    persistCrop: args.persistCrop
  });

  const warnings = [...parsed.validation.warnings];
  if (checks.checkImages.length !== checkRows.length) {
    warnings.push(
      `Detected ${checks.checkImages.length} check image crop(s) for ${checkRows.length} checks-cleared row(s).`
    );
  }

  return {
    transactions: parsed.transactions,
    checks: parsed.checks,
    checkImages: checks.checkImages,
    validation: {
      ...parsed.validation,
      warnings
    },
    debug: {
      lines,
      captions: checks.checkImages
        .map((image) => image.caption)
        .filter((caption): caption is NonNullable<typeof caption> => Boolean(caption)),
      renderedPages: checks.renderedPages.map((page) => ({
        page: page.pageNumber,
        width: page.width,
        height: page.height,
        scale: page.scale
      }))
    }
  };
};
