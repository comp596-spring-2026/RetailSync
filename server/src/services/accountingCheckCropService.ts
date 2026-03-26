import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';
import { buildCheckCropPath } from './accountingStorageService';

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
  renderCommand?: string;
  dpi?: number;
  timeoutMs?: number;
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

const makeTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'retailsync-check-crop-'));

const cleanupTempDir = async (dir: string) => {
  await fs.rm(dir, { recursive: true, force: true });
};

const writeTempPdf = async (dir: string, pdfBuffer: Buffer) => {
  const pdfPath = path.join(dir, 'input.pdf');
  await fs.writeFile(pdfPath, pdfBuffer);
  return pdfPath;
};

const runPdfToPng = (args: {
  pdfPath: string;
  outputPrefix: string;
  renderCommand: string;
  dpi: number;
  timeoutMs: number;
  pageNumber: number;
  crop: { left: number; top: number; width: number; height: number };
}) => {
  const response = spawnSync(
    args.renderCommand,
    [
      '-png',
      '-r',
      String(args.dpi),
      '-f',
      String(args.pageNumber),
      '-l',
      String(args.pageNumber),
      '-x',
      String(args.crop.left),
      '-y',
      String(args.crop.top),
      '-W',
      String(args.crop.width),
      '-H',
      String(args.crop.height),
      args.pdfPath,
      args.outputPrefix
    ],
    {
      encoding: 'utf8',
      timeout: args.timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    }
  );

  if (response.error) {
    throw new AccountingCheckCropError('CHECK_CROP_RENDER_FAILED', `Failed to execute ${args.renderCommand}`, {
      retryable: true,
      cause: response.error
    });
  }

  if (response.status !== 0) {
    throw new AccountingCheckCropError(
      'CHECK_CROP_RENDER_FAILED',
      `${args.renderCommand} exited with status ${response.status ?? 'unknown'}: ${String(response.stderr ?? '').trim()}`,
      { retryable: response.status === 1 || response.status == null }
    );
  }
};

const readRenderedCrop = async (dir: string, prefix: string) => {
  const entries = await fs.readdir(dir);
  const cropFile = entries.find((entry) => entry.startsWith(prefix) && entry.endsWith('.png'));
  if (!cropFile) {
    throw new AccountingCheckCropError('CHECK_CROP_NO_OUTPUT', 'PDF crop renderer produced no output', {
      retryable: true
    });
  }
  const buffer = await fs.readFile(path.join(dir, cropFile));
  return { fileName: cropFile, buffer };
};

export const renderCheckCropFromPdf = async (args: RenderCheckCropArgs): Promise<RenderedCheckCrop> => {
  const renderCommand = args.renderCommand ?? env.statementPdfRenderCommand;
  const dpi = args.dpi ?? env.statementPdfRenderDpi;
  const timeoutMs = args.timeoutMs ?? env.statementPdfRenderTimeoutMs;
  const marginPx = args.marginPx ?? env.statementCheckRegionMarginPx;

  if (!renderCommand || !renderCommand.trim()) {
    throw new AccountingCheckCropError('CHECK_CROP_NOT_CONFIGURED', 'Check crop render command is not configured');
  }
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new AccountingCheckCropError('CHECK_CROP_NOT_CONFIGURED', 'Check crop DPI must be a positive number');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AccountingCheckCropError('CHECK_CROP_NOT_CONFIGURED', 'Check crop timeout must be a positive number');
  }

  const tempDir = await makeTempDir();
  try {
    const pdfPath = await writeTempPdf(tempDir, args.pdfBuffer);
    const outputPrefix = path.join(tempDir, 'crop');
    const crop = normalizeBox(args.cropBox, marginPx);

    runPdfToPng({
      pdfPath,
      outputPrefix,
      renderCommand,
      dpi,
      timeoutMs,
      pageNumber: clamp(Math.floor(args.pageNumber), 1, Number.MAX_SAFE_INTEGER),
      crop
    });

    const rendered = await readRenderedCrop(tempDir, 'crop-');
    return {
      pageNumber: args.pageNumber,
      cropBox: args.cropBox,
      fileName: rendered.fileName,
      buffer: rendered.buffer
    };
  } finally {
    await cleanupTempDir(tempDir);
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
