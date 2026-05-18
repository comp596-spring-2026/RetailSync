import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCheckCropPath } from './accountingStorageService';

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgJ7xLQwAAAAASUVORK5CYII=',
  'base64'
);

const storageSaves = vi.hoisted(() => ({
  saves: [] as Array<{ objectPath: string; buffer: Buffer }>
}));

const renderPdfPageToBufferMock = vi.hoisted(() => vi.fn());
vi.mock('../statement-extraction/offline/renderPdfPage', () => ({
  renderPdfPageToBuffer: (...args: unknown[]) => renderPdfPageToBufferMock(...args)
}));

vi.mock('../config/env', () => ({
  env: {
    statementCheckRegionMarginPx: 24
  }
}));

vi.mock('../integrations/google/storage.client', () => ({
  getStorageClient: () => ({
    bucket: (bucketName: string) => ({
      file: (objectPath: string) => ({
        save: async (value: Buffer | string) => {
          storageSaves.saves.push({
            objectPath: `${bucketName}::${objectPath}`,
            buffer: Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(String(value))
          });
        }
      })
    })
  })
}));

describe('accountingCheckCropService', () => {
  beforeEach(() => {
    storageSaves.saves = [];
    renderPdfPageToBufferMock.mockReset();
  });

  it('renders a cropped check region and persists it to the tenant bucket', async () => {
    renderPdfPageToBufferMock.mockResolvedValue({
      pageNumber: 1,
      width: 1,
      height: 1,
      scale: 2,
      buffer: pngBuffer
    });

    const { renderAndPersistCheckCrop } = await import('./accountingCheckCropService');

    const result = await renderAndPersistCheckCrop({
      pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n'),
      pageNumber: 1,
      cropBox: { left: 0, top: 0, right: 1, bottom: 1 },
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      checkKey: 'check-001'
    });

    expect(result.crop.buffer.byteLength).toBeGreaterThan(0);
    expect(result.crop.pageNumber).toBe(1);
    expect(result.crop.fileName).toBe('crop-1.png');
    expect(result.objectPath).toBe(
      buildCheckCropPath('companies/company-a/statements/2026/03/statement-a', 'check-001', 'front.png')
    );
    expect(storageSaves.saves).toHaveLength(1);
    expect(storageSaves.saves[0]?.objectPath).toBe(
      `accounting-bucket::${buildCheckCropPath(
        'companies/company-a/statements/2026/03/statement-a',
        'check-001',
        'front.png'
      )}`
    );
  });

  it('surfaces explicit crop render failures for retries', async () => {
    renderPdfPageToBufferMock.mockRejectedValue(new Error('render failed'));

    const { renderCheckCropFromPdf } = await import('./accountingCheckCropService');

    await expect(
      renderCheckCropFromPdf({
        pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n'),
        pageNumber: 1,
        cropBox: { left: 0, top: 0, right: 1, bottom: 1 }
      })
    ).rejects.toMatchObject({
      name: 'AccountingCheckCropError',
      code: 'CHECK_CROP_RENDER_FAILED',
      retryable: true
    });
  });
});
