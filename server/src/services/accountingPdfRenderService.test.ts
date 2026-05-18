import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPageImagePath } from './accountingStorageService';
import {
  persistRenderedStatementPages,
  renderAndPersistStatementPages,
  renderStatementPdfPages
} from './accountingPdfRenderService';

const pngBuffer1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgJ7xLQwAAAAASUVORK5CYII=',
  'base64'
);
const pngBuffer2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1CAQAAAC0lEQVR42mP8Xw8AAoMBgJ7xLQwAAAAASUVORK5CYII=',
  'base64'
);

const storageSaves = vi.hoisted(() => ({
  saves: [] as Array<{ objectPath: string; buffer: Buffer; options: Record<string, unknown> | undefined }>
}));

const getPdfPageCountMock = vi.hoisted(() => vi.fn());
const renderPdfPageToBufferMock = vi.hoisted(() => vi.fn());

vi.mock('../statement-extraction/offline/renderPdfPage', () => ({
  getPdfPageCount: (...args: unknown[]) => getPdfPageCountMock(...args),
  renderPdfPageToBuffer: (...args: unknown[]) => renderPdfPageToBufferMock(...args)
}));

vi.mock('../integrations/google/storage.client', () => ({
  getStorageClient: () => ({
    bucket: (bucketName: string) => ({
      file: (objectPath: string) => ({
        save: async (value: Buffer | string, options?: Record<string, unknown>) => {
          storageSaves.saves.push({
            objectPath: `${bucketName}::${objectPath}`,
            buffer: Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value)),
            options
          });
        }
      })
    })
  })
}));

describe('accountingPdfRenderService', () => {
  beforeEach(() => {
    storageSaves.saves = [];
    getPdfPageCountMock.mockReset();
    renderPdfPageToBufferMock.mockReset();
  });

  it('renders all pdf pages and persists them into tenant bucket paths', async () => {
    getPdfPageCountMock.mockResolvedValue(2);
    renderPdfPageToBufferMock
      .mockResolvedValueOnce({ pageNumber: 1, width: 1, height: 1, scale: 2, buffer: pngBuffer1 })
      .mockResolvedValueOnce({ pageNumber: 2, width: 1, height: 1, scale: 2, buffer: pngBuffer2 });

    const result = await renderAndPersistStatementPages({
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n2 0 obj\n<< /Type /Page >>\nendobj\n')
    });

    expect(result.pageCount).toBe(2);
    expect(result.pageImagePaths).toEqual([
      buildPageImagePath('companies/company-a/statements/2026/03/statement-a', 1),
      buildPageImagePath('companies/company-a/statements/2026/03/statement-a', 2)
    ]);
    expect(storageSaves.saves.map((save) => save.objectPath)).toEqual([
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/pages/page-001.png',
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/pages/page-002.png'
    ]);
    expect(storageSaves.saves[0]?.buffer.equals(pngBuffer1)).toBe(true);
    expect(storageSaves.saves[1]?.buffer.equals(pngBuffer2)).toBe(true);
  });

  it('is safe to re-run page persistence to the same bucket paths', async () => {
    getPdfPageCountMock.mockResolvedValue(1);
    renderPdfPageToBufferMock.mockResolvedValue({ pageNumber: 1, width: 1, height: 1, scale: 2, buffer: pngBuffer1 });

    const rendered = await renderStatementPdfPages({
      pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n')
    });

    const first = await persistRenderedStatementPages({
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      pages: rendered
    });
    const second = await persistRenderedStatementPages({
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      pages: rendered
    });

    expect(first.pageImagePaths).toEqual(second.pageImagePaths);
    expect(storageSaves.saves).toHaveLength(2);
    expect(storageSaves.saves[0]?.objectPath).toBe(storageSaves.saves[1]?.objectPath);
  });

  it('surfaces explicit render failures for retryable task handling', async () => {
    getPdfPageCountMock.mockResolvedValue(0);

    await expect(
      renderStatementPdfPages({
        pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n')
      })
    ).rejects.toMatchObject({
      name: 'AccountingPdfRenderError',
      code: 'PDF_RENDER_NO_OUTPUT'
    });
  });
});
