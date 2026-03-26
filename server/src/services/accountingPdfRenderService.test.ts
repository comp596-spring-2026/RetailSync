import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPageImagePath } from './accountingStorageService';
import {
  AccountingPdfRenderError,
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

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock('node:child_process', () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args)
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
    spawnSyncMock.mockReset();
  });

  it('renders all pdf pages and persists them into tenant bucket paths', async () => {
    spawnSyncMock.mockImplementation((_command: string, args: string[]) => {
      const outputPrefix = args.at(-1);
      if (!outputPrefix) {
        return { status: 1, stderr: 'missing output prefix' };
      }
      fs.writeFileSync(`${outputPrefix}-1.png`, pngBuffer1);
      fs.writeFileSync(`${outputPrefix}-2.png`, pngBuffer2);
      return { status: 0, stderr: '', stdout: '' };
    });

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
    spawnSyncMock.mockImplementation((_command: string, args: string[]) => {
      const outputPrefix = args.at(-1);
      if (!outputPrefix) {
        return { status: 1, stderr: 'missing output prefix' };
      }
      fs.writeFileSync(`${outputPrefix}-1.png`, pngBuffer1);
      return { status: 0, stderr: '', stdout: '' };
    });

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
    spawnSyncMock.mockReturnValue({ status: 127, stderr: 'pdftoppm not found', stdout: '' });

    await expect(
      renderStatementPdfPages({
        pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n')
      })
    ).rejects.toMatchObject({
      name: 'AccountingPdfRenderError',
      code: 'PDF_RENDER_COMMAND_FAILED'
    } as Partial<AccountingPdfRenderError>);
  });
});
