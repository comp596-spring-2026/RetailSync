import {
  detectCaptionAnchoredImageBox,
  detectCheckImageBoxes
} from './detectCheckImages';
import { buildCropVariants } from './cropCheckImages';
import { extractCheckCaptions, findMatchingCheckRow, matchCaptionToImageBox } from './matchCheckCaptions';
import { renderPdfPageToBuffer, scalePdfBoxToImageBox } from './renderPdfPage';
import type { CheckRow, DetectedCheckImage, GroupedPdfLine, RenderedPdfPage } from './types';
import { buildAlignmentStatus, intersectionOverUnion } from './validateExtraction';

export const extractChecks = async (args: {
  pdfBuffer: Buffer;
  lines: GroupedPdfLine[];
  checkRows: CheckRow[];
  renderScale?: number;
  persistCrop: (params: {
    checkNumber: string;
    imageBuffer: Buffer;
    reviewBuffer: Buffer;
  }) => Promise<{ imageCropPath: string; reviewCropPath: string }>;
}): Promise<{
  checkImages: DetectedCheckImage[];
  renderedPages: RenderedPdfPage[];
}> => {
  const renderScale = args.renderScale ?? 2;
  const captions = extractCheckCaptions(args.lines);
  const pagesWithCaptions = [...new Set(captions.map((caption) => caption.page))].sort((left, right) => left - right);
  const renderedPages: RenderedPdfPage[] = [];
  const results: DetectedCheckImage[] = [];

  for (const pageNumber of pagesWithCaptions) {
    const renderedPage = await renderPdfPageToBuffer(args.pdfBuffer, pageNumber, renderScale);
    renderedPages.push(renderedPage);

    const pageCaptions = captions.filter((caption) => caption.page === pageNumber);
    const candidateBoxes = await detectCheckImageBoxes(renderedPage.buffer);
    const usedBoxIndexes = new Set<number>();

    for (const caption of pageCaptions) {
      const captionBoxPx = scalePdfBoxToImageBox(caption.bbox, renderScale);
      let matchedBoxIndex = -1;
      let matchedBox = candidateBoxes.find((box, index) => {
        if (usedBoxIndexes.has(index)) return false;
        const candidateCaption = matchCaptionToImageBox(box, [caption], renderScale);
        if (!candidateCaption) return false;
        matchedBoxIndex = index;
        return true;
      });

      if (!matchedBox) {
        matchedBox = (await detectCaptionAnchoredImageBox(renderedPage.buffer, captionBoxPx)) ?? undefined;
      } else if (matchedBoxIndex >= 0) {
        usedBoxIndexes.add(matchedBoxIndex);
      }

      if (!matchedBox) continue;

      const crop = await buildCropVariants({
        pageBuffer: renderedPage.buffer,
        pageWidth: renderedPage.width,
        pageHeight: renderedPage.height,
        imageBox: matchedBox
      });
      const paths = await args.persistCrop({
        checkNumber: caption.checkNumber,
        imageBuffer: crop.imageBuffer,
        reviewBuffer: crop.reviewBuffer
      });
      const checkRow = findMatchingCheckRow(caption, args.checkRows);
      const inferredBox = {
        left: captionBoxPx.left - 12,
        top: matchedBox.top,
        width: captionBoxPx.width + 24,
        height: matchedBox.height
      };

      results.push({
        page: pageNumber,
        checkNumber: checkRow?.checkNumber ?? caption.checkNumber,
        amount: checkRow?.amount ?? caption.amount,
        imageBox: crop.imageBox,
        reviewBox: crop.reviewBox,
        imageCropPath: paths.imageCropPath,
        reviewCropPath: paths.reviewCropPath,
        caption,
        alignment: buildAlignmentStatus({
          imageBox: crop.imageBox,
          reviewBox: crop.reviewBox,
          caption: {
            ...caption,
            bbox: captionBoxPx
          },
          inferredBox,
          matchedBy: checkRow ? 'checkNumber+amount' : 'nearestCaption',
          amountMatches:
            checkRow?.amount == null ? true : Math.abs(Number(checkRow.amount) - Number(caption.amount)) < 0.01
        })
      });
    }
  }

  return {
    checkImages: results
      .map((entry) => ({
        ...entry,
        alignment: {
          ...entry.alignment,
          iou:
            entry.caption
              ? intersectionOverUnion(
                  entry.imageBox,
                  scalePdfBoxToImageBox(entry.caption.bbox, renderScale)
                )
              : entry.alignment.iou
        }
      }))
      .sort((left, right) =>
        (left.checkNumber ?? '').localeCompare(right.checkNumber ?? '') ||
        left.page - right.page ||
        left.imageBox.top - right.imageBox.top
      ),
    renderedPages
  };
};
