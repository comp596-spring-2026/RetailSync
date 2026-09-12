import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { extractStatementPagesFromPdfBuffer } from './accountingPdfTextExtractionService';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(__dirname, '../../../shared/src/accounting/testStatmentPDF.pdf');
// The statement fixture is a private document and is not committed; this test runs only with a local copy.
const hasFixturePdf = fs.existsSync(fixturePath);

describe('accountingPdfTextExtractionService', () => {
  it.skipIf(!hasFixturePdf)('extracts non-empty text from the shared statement fixture', async () => {
    const buffer = fs.readFileSync(fixturePath);
    const pages = await extractStatementPagesFromPdfBuffer(buffer);

    expect(pages.length).toBeGreaterThanOrEqual(1);
    const combined = pages.map((p) => p.text).join('\n');
    expect(combined.length).toBeGreaterThan(50);
    expect(pages[0].pageNumber).toBe(1);
  });
});
