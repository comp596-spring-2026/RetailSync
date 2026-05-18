import { getStorageClient } from '../integrations/google/storage.client';
import { buildPageImagePath } from './accountingStorageService';
import { getPdfPageCount, renderPdfPageToBuffer } from '../statement-extraction/offline/renderPdfPage';

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
};

export type PersistRenderedStatementPagesArgs = {
  bucketName: string;
  rootPrefix: string;
  pages: RenderedStatementPage[];
};

export const renderStatementPdfPages = async (
  args: RenderStatementPdfPagesArgs
): Promise<RenderedStatementPage[]> => {
  const pageCount = await getPdfPageCount(args.pdfBuffer);
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    throw new AccountingPdfRenderError('PDF_RENDER_NO_OUTPUT', 'PDF renderer produced no page images');
  }

  const scale = 2; // Default scale since dpi is removed
  const pages: RenderedStatementPage[] = [];

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const rendered = await renderPdfPageToBuffer(args.pdfBuffer, pageNumber, scale);
    pages.push({
      pageNo: pageNumber,
      fileName: `page-${String(pageNumber).padStart(3, '0')}.png`,
      buffer: rendered.buffer
    });
  }

  return pages;
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
}) => {
  const pages = await renderStatementPdfPages({
    pdfBuffer: args.pdfBuffer,
    fileName: args.fileName
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
