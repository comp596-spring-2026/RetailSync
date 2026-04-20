import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { extractStatementPagesFromPdfBuffer } from './accountingPdfTextExtractionService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('accountingPdfTextExtractionService', () => {
  it('extracts non-empty text from the shared statement fixture', async () => {
    const fixturePath = path.resolve(__dirname, '../../../shared/src/accounting/testStatmentPDF.pdf');
    const buffer = fs.readFileSync(fixturePath);
    const pages = await extractStatementPagesFromPdfBuffer(buffer);

    expect(pages.length).toBeGreaterThanOrEqual(1);
    const combined = pages.map((p) => p.text).join('\n');
    expect(combined.length).toBeGreaterThan(50);
    expect(pages[0].pageNumber).toBe(1);
  });
});
