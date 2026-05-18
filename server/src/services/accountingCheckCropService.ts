import sharp from 'sharp';
import { coerceSharpInputBuffer } from '../utils/imageInput';
import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';
import { buildCheckCropPath } from './accountingStorageService';
import { renderPdfPageToBuffer } from '../statement-extraction/offline/renderPdfPage';

export class AccountingCheckCropError extends Error {
  code: string;

  retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: {
      retryable?: boolean;
      cause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = 'AccountingCheckCropError';
    this.code = code;
    this.retryable = Boolean(options.retryable ?? false);
    if (options.cause instanceof Error && options.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
  }
}

export type CheckCropBox = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type RenderCheckCropArgs = {
  pdfBuffer: Buffer;
  pageNumber: number;
  cropBox: CheckCropBox;
  marginPx?: number;
};

export type RenderedCheckCrop = {
  pageNumber: number;
  cropBox: CheckCropBox;
  fileName: string;
  buffer: Buffer;
};

export type PersistCheckCropArgs = {
  bucketName: string;
  rootPrefix: string;
  checkKey: string;
  fileName?: string;
};

export type PersistRenderedCheckCropArgs = PersistCheckCropArgs & {
  crop: RenderedCheckCrop;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeBox = (box: CheckCropBox, marginPx: number) => {
  const left = Math.max(0, Math.floor(box.left - marginPx));
  const top = Math.max(0, Math.floor(box.top - marginPx));
  const right = Math.max(left + 1, Math.ceil(box.right + marginPx));
  const bottom = Math.max(top + 1, Math.ceil(box.bottom + marginPx));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top
  };
};

export const renderCheckCropFromPdf = async (args: RenderCheckCropArgs): Promise<RenderedCheckCrop> => {
  const scale = 2; // Default scale since dpi is removed
  const marginPx = args.marginPx ?? env.statementCheckRegionMarginPx ?? 0;

  try {
    const page = await renderPdfPageToBuffer(
      args.pdfBuffer,
      clamp(Math.floor(args.pageNumber), 1, Number.MAX_SAFE_INTEGER),
      scale
    );
    const crop = normalizeBox(args.cropBox, marginPx);
    const pageBuffer = coerceSharpInputBuffer('renderCheckCropFromPdf.page', page.buffer);
    // eslint-disable-next-line no-console
    console.info('[check.crop] rendering region', {
      pageNumber: args.pageNumber,
      cropBox: args.cropBox,
      normalizedCrop: crop,
      pageWidth: page.width,
      pageHeight: page.height,
      bufferBytes: pageBuffer.byteLength
    });
    const buffer = await sharp(pageBuffer)
      .extract({
        left: clamp(Math.floor(crop.left), 0, page.width - 1),
        top: clamp(Math.floor(crop.top), 0, page.height - 1),
        width: clamp(Math.floor(crop.width), 1, page.width),
        height: clamp(Math.floor(crop.height), 1, page.height)
      })
      .png()
      .toBuffer();

    return {
      pageNumber: args.pageNumber,
      cropBox: args.cropBox,
      fileName: `crop-${args.pageNumber}.png`,
      buffer
    };
  } catch (error) {
    throw new AccountingCheckCropError('CHECK_CROP_RENDER_FAILED', 'Failed to render cropped check region', {
      retryable: true,
      cause: error
    });
  }
};

export const persistCheckCropToBucket = async (args: PersistRenderedCheckCropArgs) => {
  const storage = getStorageClient();
  const bucket = storage.bucket(args.bucketName);
  const objectPath = buildCheckCropPath(args.rootPrefix, args.checkKey, args.fileName ?? 'front.png');
  await bucket.file(objectPath).save(args.crop.buffer, {
    contentType: 'image/png',
    resumable: false,
    validation: false
  });

  return {
    objectPath,
    cropImagePath: objectPath
  };
};

export const renderAndPersistCheckCrop = async (args: RenderCheckCropArgs & PersistCheckCropArgs) => {
  const crop = await renderCheckCropFromPdf(args);
  const persisted = await persistCheckCropToBucket({
    bucketName: args.bucketName,
    rootPrefix: args.rootPrefix,
    checkKey: args.checkKey,
    crop,
    fileName: args.fileName
  });

  return {
    crop,
    ...persisted
  };
};
