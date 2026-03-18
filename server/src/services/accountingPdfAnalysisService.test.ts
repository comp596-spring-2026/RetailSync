import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectStatementMonthFromPdf,
  extractPdfFallbackText,
} from './accountingPdfAnalysisService';

describe('accountingPdfAnalysisService', () => {
  it('detects a statement month from PDF text context', () => {
    const pdfBuffer = Buffer.from(
      'Statement Period March 1, 2026 through March 31, 2026 Closing Balance 123.45',
      'utf8',
    );

    const result = detectStatementMonthFromPdf({
      pdfBuffer,
      fileName: 'bank-statement.pdf',
    });

    expect(result.statementMonth).toBe('2026-03');
    expect(result.source).toBe('pdf_text');
    expect(result.confidence).toBe('high');
  });

  it('falls back to the filename when text has no usable month', () => {
    const pdfBuffer = Buffer.from('Scanned image only without useful text', 'utf8');

    const result = detectStatementMonthFromPdf({
      pdfBuffer,
      fileName: 'checking_statement_2026-02.pdf',
    });

    expect(result.statementMonth).toBe('2026-02');
    expect(result.source).toBe('filename');
  });

  it('returns no month when nothing is detectable', () => {
    const pdfBuffer = Buffer.from('No dates here at all', 'utf8');

    const result = detectStatementMonthFromPdf({
      pdfBuffer,
      fileName: 'statement.pdf',
    });

    expect(result.statementMonth).toBeNull();
    expect(result.confidence).toBe('none');
    expect(result.source).toBe('unknown');
  });

  it('normalizes extracted text to printable content', () => {
    const pdfBuffer = Buffer.from('ABC\x00\x01  DEF', 'latin1');
    expect(extractPdfFallbackText(pdfBuffer)).toBe('ABC DEF');
  });

  it('prefers statement ending text over PDF metadata for the project fixture', () => {
    const pdfPath = path.resolve(process.cwd(), '../shared/src/accounting/testStatmentPDF.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);

    const result = detectStatementMonthFromPdf({
      pdfBuffer,
      fileName: 'testStatmentPDF.pdf',
    });

    expect(result.statementMonth).toBe('2025-12');
    expect(result.source).toBe('pdf_text');
    expect(result.evidence?.toLowerCase()).toContain('statement ending');
  });
});
