import type { Box, CheckCaption, CheckRow, GroupedPdfLine } from './types';
import { scalePdfBoxToImageBox } from './renderPdfPage';

const captionRegex = /^#(\d{4})\s+\$?([\d,]+\.\d{2})$/;

const parseMoney = (value: string) => Number(value.replace(/[$,\s]/g, ''));

export const extractCheckCaptions = (lines: GroupedPdfLine[]): CheckCaption[] =>
  lines
    .map((line) => {
      const match = line.text.match(captionRegex);
      if (!match) return null;
      return {
        page: line.page,
        checkNumber: match[1],
        amount: parseMoney(match[2]),
        text: line.text,
        bbox: line.bbox
      };
    })
    .filter((entry): entry is CheckCaption => Boolean(entry));

export const findMatchingCheckRow = (
  caption: CheckCaption,
  checkRows: CheckRow[]
): CheckRow | undefined =>
  checkRows.find(
    (row) =>
      row.checkNumber === caption.checkNumber && Math.abs(Number(row.amount) - Number(caption.amount)) < 0.01
  );

const horizontalOverlap = (a: Box, b: Box) => {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.left + a.width, b.left + b.width);
  return Math.max(0, right - left);
};

export const matchCaptionToImageBox = (
  imageBox: Box,
  captions: CheckCaption[],
  scale: number
): CheckCaption | undefined => {
  const candidates = captions
    .map((caption) => ({
      caption,
      scaled: scalePdfBoxToImageBox(caption.bbox, scale)
    }))
    .filter(({ scaled }) => scaled.top >= imageBox.top - 10)
    .map(({ caption, scaled }) => {
      const overlap = horizontalOverlap(imageBox, scaled);
      const centerDistance = Math.abs(
        imageBox.left + imageBox.width / 2 - (scaled.left + scaled.width / 2)
      );
      const yDistance = Math.max(0, scaled.top - (imageBox.top + imageBox.height));
      return {
        caption,
        overlap,
        centerDistance,
        yDistance
      };
    })
    .filter((entry) => entry.overlap > 0 || entry.centerDistance < 180)
    .sort((left, right) => left.yDistance - right.yDistance || right.overlap - left.overlap || left.centerDistance - right.centerDistance);

  return candidates[0]?.caption;
};
