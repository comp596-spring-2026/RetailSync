import sharp from 'sharp';
import type { Box } from './types';
import { clampBoxToPage, normalizeBox, validateCaptionSpace } from './validateExtraction';

export const expandCheckCropForCaption = (
  imageBox: Box,
  pageWidth: number,
  pageHeight: number
): Box => {
  const padLeft = 10;
  const padRight = 10;
  const padTop = 28;
  const captionSpace = 58;

  const left = Math.max(0, imageBox.left - padLeft);
  const top = Math.max(0, imageBox.top - padTop);
  const right = Math.min(pageWidth, imageBox.left + imageBox.width + padRight);
  const bottom = Math.min(pageHeight, imageBox.top + imageBox.height + captionSpace);

  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
};

export const cropPngBuffer = async (buffer: Buffer, box: Box) => {
  const normalized = normalizeBox(box);
  return sharp(buffer)
    .extract({
      left: Math.round(normalized.left),
      top: Math.round(normalized.top),
      width: Math.round(normalized.width),
      height: Math.round(normalized.height)
    })
    .png()
    .toBuffer();
};

export const buildCropVariants = async (args: {
  pageBuffer: Buffer;
  pageWidth: number;
  pageHeight: number;
  imageBox: Box;
}) => {
  const imageBox = clampBoxToPage(normalizeBox(args.imageBox), args.pageWidth, args.pageHeight);
  const reviewBox = clampBoxToPage(
    expandCheckCropForCaption(imageBox, args.pageWidth, args.pageHeight),
    args.pageWidth,
    args.pageHeight
  );

  const [imageBuffer, reviewBuffer] = await Promise.all([
    cropPngBuffer(args.pageBuffer, imageBox),
    cropPngBuffer(args.pageBuffer, reviewBox)
  ]);

  return {
    imageBox,
    reviewBox,
    imageBuffer,
    reviewBuffer,
    captionSpace: validateCaptionSpace(imageBox, reviewBox)
  };
};
