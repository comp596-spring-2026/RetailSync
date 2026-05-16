import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildCheckCropPath, buildCheckOcrPath, buildCheckStructuredPath } from './accountingStorageService';

const cropRenderMock = vi.hoisted(() => vi.fn());
const persistCropMock = vi.hoisted(() => vi.fn());
const ocrMock = vi.hoisted(() => vi.fn());
const storageSaves = vi.hoisted(() => ({
  saves: [] as Array<{ objectPath: string; buffer: Buffer }>
}));

vi.mock('./accountingCheckCropService', () => ({
  renderCheckCropFromPdf: cropRenderMock,
  renderAndPersistCheckCrop: persistCropMock
}));

vi.mock('../integrations/google/visionOcr.client', () => ({
  ocrImageWithVision: ocrMock
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

describe('accountingCheckExtractionService', () => {
  beforeEach(() => {
    cropRenderMock.mockReset();
    persistCropMock.mockReset();
    ocrMock.mockReset();
    storageSaves.saves = [];
  });

  it('extracts check fields deterministically from OCR text and page context', async () => {
    const { extractCheckFieldsFromOcr } = await import('./accountingCheckExtractionService');

    const result = extractCheckFieldsFromOcr({
      cropText: [
        'Check No. 1002',
        'Pay to the Order of Acme Plumbing',
        'Date 03/25/2026',
        '$1,250.00',
        'Memo: invoice 441'
      ].join('\n')
    });

    expect(result.extracted).toMatchObject({
      checkNumber: '1002',
      date: '2026-03-25',
      payeeName: 'Acme Plumbing',
      amount: 1250,
      memo: 'invoice 441',
      source: 'ocr'
    });
    expect(result.reasons).toHaveLength(4);
  });

  it('falls back to deterministic data when OCR text is sparse', async () => {
    const { extractCheckFieldsFromOcr } = await import('./accountingCheckExtractionService');

    const result = extractCheckFieldsFromOcr({
      cropText: '',
      fallback: {
        checkNumber: '889',
        date: '2026-03-24',
        payeeName: 'Fallback Vendor',
        amount: 144.22,
        source: 'legacy'
      }
    });

    expect(result.extracted).toMatchObject({
      checkNumber: '889',
      date: '2026-03-24',
      payeeName: 'Fallback Vendor',
      amount: 144.22,
      source: 'legacy'
    });
  });

  it('persists extraction artifacts and returns structured extraction output from statement PDF text', async () => {
    persistCropMock.mockResolvedValue({
      crop: {
        pageNumber: 2,
        cropBox: { left: 20, top: 40, right: 220, bottom: 180 },
        fileName: 'crop-2.png',
        buffer: Buffer.from('png-bytes')
      },
      objectPath: 'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/front.png',
      cropImagePath: 'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/front.png'
    });

    const { runStatementCheckExtraction } = await import('./accountingCheckExtractionService');
    const pageText = [
      'Check 1002',
      'Pay to the Order of Acme Plumbing',
      'Date 03/25/2026',
      '$1,250.00',
      'Memo: invoice 441'
    ].join('\n');

    const result = await runStatementCheckExtraction({
      pdfBuffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\n'),
      pageNumber: 2,
      cropBox: { left: 20, top: 40, right: 220, bottom: 180 },
      checkKey: 'check-001',
      pageContext: 'Pay to the Order of Acme Plumbing',
      internalPdfPageText: pageText,
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      persistArtifacts: true
    });

    expect(persistCropMock).toHaveBeenCalledTimes(1);
    expect(ocrMock).not.toHaveBeenCalled();
    expect(result.artifacts).toMatchObject({
      cropImagePath: buildCheckCropPath('companies/company-a/statements/2026/03/statement-a', 'check-001', 'front.png'),
      ocrTextPath: buildCheckOcrPath('companies/company-a/statements/2026/03/statement-a', 'check-001', 'ocr.txt'),
      ocrJsonPath: buildCheckOcrPath('companies/company-a/statements/2026/03/statement-a', 'check-001', 'ocr.json'),
      structuredPath: buildCheckStructuredPath('companies/company-a/statements/2026/03/statement-a', 'check-001')
    });
    expect(result.extracted).toMatchObject({
      checkNumber: '1002',
      date: '2026-03-25',
      payeeName: 'Acme Plumbing',
      amount: 1250,
      memo: 'invoice 441',
      source: 'pdf_text'
    });
    expect(result.ocr.text).toBe(pageText);
    expect(result.confidence.overall).toBeGreaterThan(0.5);
    expect(storageSaves.saves.map((save) => save.objectPath)).toEqual([
      `accounting-bucket::${buildCheckOcrPath('companies/company-a/statements/2026/03/statement-a', 'check-001', 'ocr.txt')}`,
      `accounting-bucket::${buildCheckOcrPath('companies/company-a/statements/2026/03/statement-a', 'check-001', 'ocr.json')}`,
      `accounting-bucket::${buildCheckStructuredPath('companies/company-a/statements/2026/03/statement-a', 'check-001')}`
    ]);
  });
});
