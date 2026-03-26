import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCheckCropPath } from './accountingStorageService';

const pngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgJ7xLQwAAAAASUVORK5CYII=',
  'base64'
);

const storageSaves = vi.hoisted(() => ({
  saves: [] as Array<{ objectPath: string; buffer: Buffer }>
}));

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args)
}));

vi.mock('../config/env', () => ({
  env: {
    statementPdfRenderCommand: 'pdftoppm',
    statementPdfRenderDpi: 144,
    statementPdfRenderTimeoutMs: 120000,
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
    spawnSyncMock.mockReset();
  });

  it('renders a cropped check region and persists it to the tenant bucket', async () => {
    spawnSyncMock.mockImplementation((_command: string, args: string[]) => {
      const outputPrefix = args.at(-1);
      if (!outputPrefix) {
        return { status: 1, stderr: 'missing output prefix', stdout: '' };
      }
      fs.writeFileSync(`${outputPrefix}-1.png`, pngBuffer);
      return { status: 0, stderr: '', stdout: '' };
    });

    const { renderAndPersistCheckCrop } = await import('./accountingCheckCropService');

    const result = await renderAndPersistCheckCrop({
      pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n'),
      pageNumber: 1,
      cropBox: { left: 20, top: 40, right: 220, bottom: 160 },
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      checkKey: 'check-001'
    });

    expect(result.crop.buffer.equals(pngBuffer)).toBe(true);
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
    spawnSyncMock.mockReturnValue({ status: 127, stderr: 'pdftoppm not found', stdout: '' });

    const { renderCheckCropFromPdf } = await import('./accountingCheckCropService');

    await expect(
      renderCheckCropFromPdf({
        pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n'),
        pageNumber: 1,
        cropBox: { left: 20, top: 40, right: 220, bottom: 160 }
      })
    ).rejects.toMatchObject({
      name: 'AccountingCheckCropError',
      code: 'CHECK_CROP_RENDER_FAILED',
      retryable: false
    });
  });
});
