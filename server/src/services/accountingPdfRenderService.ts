import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';
import { buildPageImagePath } from './accountingStorageService';

export class AccountingPdfRenderError extends Error {
  code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'AccountingPdfRenderError';
    this.code = code;
    if (cause instanceof Error && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

export type RenderedStatementPage = {
  pageNo: number;
  fileName: string;
  buffer: Buffer;
};

export type RenderStatementPdfPagesArgs = {
  pdfBuffer: Buffer;
  fileName?: string;
  renderCommand?: string;
  dpi?: number;
  timeoutMs?: number;
};

export type PersistRenderedStatementPagesArgs = {
  bucketName: string;
  rootPrefix: string;
  pages: RenderedStatementPage[];
};

const isNotEmpty = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const parseRenderedPageNo = (fileName: string) => {
  const match = fileName.match(/-(\d+)\.png$/i);
  return match ? Number(match[1]) : null;
};

const makeTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'retailsync-pdf-render-'));

const cleanupTempDir = async (dir: string) => {
  await fs.rm(dir, { recursive: true, force: true });
};

const writeTempPdf = async (dir: string, pdfBuffer: Buffer) => {
  const pdfPath = path.join(dir, 'input.pdf');
  await fs.writeFile(pdfPath, pdfBuffer);
  return pdfPath;
};

const runPdfToPng = async (args: {
  pdfPath: string;
  outputPrefix: string;
  renderCommand: string;
  dpi: number;
  timeoutMs: number;
}) => {
  const response = spawnSync(
    args.renderCommand,
    ['-png', '-r', String(args.dpi), args.pdfPath, args.outputPrefix],
    {
      encoding: 'utf8',
      timeout: args.timeoutMs,
      maxBuffer: 10 * 1024 * 1024
    }
  );

  if (response.error) {
    throw new AccountingPdfRenderError(
      'PDF_RENDER_COMMAND_FAILED',
      `Failed to execute ${args.renderCommand}`,
      response.error
    );
  }

  if (response.status !== 0) {
    throw new AccountingPdfRenderError(
      'PDF_RENDER_COMMAND_FAILED',
      `${args.renderCommand} exited with status ${response.status ?? 'unknown'}: ${String(response.stderr ?? '').trim()}`
    );
  }
};

const readRenderedPages = async (dir: string, prefix: string) => {
  const entries = await fs.readdir(dir);
  const pageFiles = entries
    .filter((entry) => entry.startsWith(prefix) && entry.endsWith('.png'))
    .map((entry) => {
      const pageNo = parseRenderedPageNo(entry);
      return pageNo ? { entry, pageNo } : null;
    })
    .filter((entry): entry is { entry: string; pageNo: number } => Boolean(entry))
    .sort((left, right) => left.pageNo - right.pageNo);

  const pages: RenderedStatementPage[] = [];
  for (const pageFile of pageFiles) {
    const buffer = await fs.readFile(path.join(dir, pageFile.entry));
    pages.push({
      pageNo: pageFile.pageNo,
      fileName: pageFile.entry,
      buffer
    });
  }

  return pages;
};

export const renderStatementPdfPages = async (
  args: RenderStatementPdfPagesArgs
): Promise<RenderedStatementPage[]> => {
  const renderCommand = args.renderCommand ?? env.statementPdfRenderCommand;
  const dpi = args.dpi ?? env.statementPdfRenderDpi;
  const timeoutMs = args.timeoutMs ?? env.statementPdfRenderTimeoutMs;

  if (!isNotEmpty(renderCommand)) {
    throw new AccountingPdfRenderError('PDF_RENDER_NOT_CONFIGURED', 'Statement PDF render command is not configured');
  }
  if (!Number.isFinite(dpi) || dpi <= 0) {
    throw new AccountingPdfRenderError('PDF_RENDER_NOT_CONFIGURED', 'Statement PDF render DPI must be a positive number');
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new AccountingPdfRenderError(
      'PDF_RENDER_NOT_CONFIGURED',
      'Statement PDF render timeout must be a positive number'
    );
  }

  const tempDir = await makeTempDir();
  try {
    const pdfPath = await writeTempPdf(tempDir, args.pdfBuffer);
    const outputPrefix = path.join(tempDir, 'page');

    await runPdfToPng({
      pdfPath,
      outputPrefix,
      renderCommand,
      dpi,
      timeoutMs
    });

    const pages = await readRenderedPages(tempDir, 'page-');
    if (pages.length === 0) {
      throw new AccountingPdfRenderError('PDF_RENDER_NO_OUTPUT', 'PDF renderer produced no page images');
    }

    return pages;
  } finally {
    await cleanupTempDir(tempDir);
  }
};

export const persistRenderedStatementPages = async (args: PersistRenderedStatementPagesArgs) => {
  const storage = getStorageClient();
  const bucket = storage.bucket(args.bucketName);
  const pageImagePaths: string[] = [];
  const pages = [...args.pages].sort((left, right) => left.pageNo - right.pageNo);

  for (const page of pages) {
    const objectPath = buildPageImagePath(args.rootPrefix, page.pageNo);
    const file = bucket.file(objectPath);
    await file.save(page.buffer, {
      contentType: 'image/png',
      resumable: false,
      validation: false
    });
    pageImagePaths.push(objectPath);
  }

  return { pageImagePaths };
};

export const renderAndPersistStatementPages = async (args: {
  bucketName: string;
  rootPrefix: string;
  pdfBuffer: Buffer;
  fileName?: string;
  renderCommand?: string;
  dpi?: number;
  timeoutMs?: number;
}) => {
  const pages = await renderStatementPdfPages({
    pdfBuffer: args.pdfBuffer,
    fileName: args.fileName,
    renderCommand: args.renderCommand,
    dpi: args.dpi,
    timeoutMs: args.timeoutMs
  });

  const persisted = await persistRenderedStatementPages({
    bucketName: args.bucketName,
    rootPrefix: args.rootPrefix,
    pages
  });

  return {
    pageCount: pages.length,
    pages,
    pageImagePaths: persisted.pageImagePaths
  };
};
