import type { Box, CheckCaption, DetectedCheckImageAlignment } from './types';

export const boxContains = (container: Box, child: Box): boolean =>
  child.left >= container.left &&
  child.top >= container.top &&
  child.left + child.width <= container.left + container.width &&
  child.top + child.height <= container.top + container.height;

export const intersectionOverUnion = (a: Box, b: Box): number => {
  const x1 = Math.max(a.left, b.left);
  const y1 = Math.max(a.top, b.top);
  const x2 = Math.min(a.left + a.width, b.left + b.width);
  const y2 = Math.min(a.top + a.height, b.top + b.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  return union === 0 ? 0 : intersection / union;
};

export const normalizeBox = (box: Box): Box => ({
  left: Math.max(0, Math.round(box.left)),
  top: Math.max(0, Math.round(box.top)),
  width: Math.max(1, Math.round(box.width)),
  height: Math.max(1, Math.round(box.height))
});

export const clampBoxToPage = (box: Box, pageWidth: number, pageHeight: number): Box => {
  const left = Math.max(0, Math.min(pageWidth - 1, box.left));
  const top = Math.max(0, Math.min(pageHeight - 1, box.top));
  const right = Math.max(left + 1, Math.min(pageWidth, box.left + box.width));
  const bottom = Math.max(top + 1, Math.min(pageHeight, box.top + box.height));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
};

export const validateCaptionSpace = (imageBox: Box, reviewBox: Box) => {
  const bottomCaptionPadding =
    reviewBox.top + reviewBox.height - (imageBox.top + imageBox.height);

  return {
    bottomCaptionPadding,
    hasEnoughCaptionSpace: bottomCaptionPadding >= 44,
    status: bottomCaptionPadding >= 44 ? 'OK' : 'NEEDS_REVIEW'
  } as const;
};

export const buildAlignmentStatus = (args: {
  imageBox: Box;
  reviewBox: Box;
  caption?: CheckCaption;
  inferredBox?: Box;
  matchedBy: DetectedCheckImageAlignment['matchedBy'];
  amountMatches: boolean;
}): DetectedCheckImageAlignment => {
  const captionInsideReviewBox = args.caption ? boxContains(args.reviewBox, args.caption.bbox) : false;
  const captionSpace = validateCaptionSpace(args.imageBox, args.reviewBox);
  const iou = args.inferredBox ? intersectionOverUnion(args.imageBox, args.inferredBox) : undefined;

  let status: DetectedCheckImageAlignment['status'] = 'OK';
  if (!args.caption) {
    status = 'MISSING_CAPTION';
  } else if (!captionInsideReviewBox || captionSpace.bottomCaptionPadding < 44 || args.amountMatches === false) {
    status = 'MISALIGNED';
  } else if (iou != null && iou < 0.2) {
    status = 'MISALIGNED';
  } else if (captionSpace.status !== 'OK') {
    status = 'NEEDS_REVIEW';
  }

  return {
    matchedBy: args.matchedBy,
    captionInsideReviewBox,
    bottomCaptionPadding: captionSpace.bottomCaptionPadding,
    iou,
    status
  };
};
