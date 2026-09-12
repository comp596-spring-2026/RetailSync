import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  applyLayoutSectionsToParsedTransactions,
  deriveSectionBoundsFromLayout,
  extractChecksClearedFromLayout,
  extractDailyBalancesFromLayout,
  extractStatementPagesLayoutFromPdfBuffer
} from './accountingPdfLayoutExtractionService';
import { extractStatementPagesFromPdfBuffer as extractTextPages } from './accountingPdfTextExtractionService';
import { parseTransactionsFromOcrPages } from '../jobs/accountingTaskRunner';
import { buildStatementValidationReport } from './statementValidationService';

const here = path.dirname(fileURLToPath(import.meta.url));
// The statement fixture is a private document and is not committed; these tests run only with a local copy.
const hasFixturePdf = existsSync(path.resolve(here, '../../../shared/src/accounting/testStatmentPDF.pdf'));

describe('accountingPdfLayoutExtractionService', () => {
  it.skipIf(!hasFixturePdf)('extracts coordinate items and section bounds from the SouthState fixture', async () => {
    const pdfPath = path.resolve(
      here,
      '../../../shared/src/accounting/testStatmentPDF.pdf'
    );
    const buffer = await fs.readFile(pdfPath);

    const pages = await extractStatementPagesLayoutFromPdfBuffer(buffer);
    expect(pages).toHaveLength(8);

    const firstPage = pages[0];
    expect(firstPage.pageWidth).toBeGreaterThan(0);
    expect(firstPage.pageHeight).toBeGreaterThan(0);
    expect(firstPage.items.length).toBeGreaterThan(10);

    for (const item of firstPage.items.slice(0, 5)) {
      expect(typeof item.text).toBe('string');
      expect(Number.isFinite(item.x)).toBe(true);
      expect(Number.isFinite(item.y)).toBe(true);
    }

    const bounds = deriveSectionBoundsFromLayout(pages);
    const byPageAndSection = bounds.reduce<Record<string, number[]>>((acc, b) => {
      acc[b.section] = acc[b.section] ?? [];
      acc[b.section].push(b.pageNumber);
      return acc;
    }, {});

    expect(byPageAndSection.account_summary).toContain(1);
    expect(byPageAndSection.deposits).toContain(1);
    expect(byPageAndSection.electronic_credits).toContain(1);
    expect(byPageAndSection.other_credits).toContain(1);
    expect(byPageAndSection.other_credits).toContain(2);
    expect(byPageAndSection.electronic_debits).toContain(2);
    expect(byPageAndSection.checks_cleared).toEqual([3]);
    expect(byPageAndSection.daily_balances).toEqual([3]);

    const checks = extractChecksClearedFromLayout(pages, bounds);
    expect(checks).toHaveLength(44);
    const checksTotal = checks.reduce((sum, row) => sum + row.amount, 0);
    expect(Number(checksTotal.toFixed(2))).toBe(32744);
    const uniqueCheckNumbers = new Set(checks.map((row) => row.checkNumber));
    expect(uniqueCheckNumbers.size).toBe(44);
    for (const row of checks) {
      expect(row.pageNumber).toBe(3);
      expect(row.date).toMatch(/^2025-1[12]-\d{2}$/);
      expect(row.checkNumber).toMatch(/^\d{4}$/);
    }

    const balances = extractDailyBalancesFromLayout(pages, bounds);
    expect(balances).toHaveLength(22);
    for (const row of balances) {
      expect(row.pageNumber).toBe(3);
      expect(row.date).toMatch(/^2025-1[12]-\d{2}$/);
      expect(row.amount).toBeGreaterThan(0);
    }
  }, 30000);

  it.skipIf(!hasFixturePdf)('reconciles parsed transactions with layout section bounds for SouthState truth', async () => {
    const pdfPath = path.resolve(
      here,
      '../../../shared/src/accounting/testStatmentPDF.pdf'
    );
    const buffer = await fs.readFile(pdfPath);
    const layoutPages = await extractStatementPagesLayoutFromPdfBuffer(buffer);
    const sectionBounds = deriveSectionBoundsFromLayout(layoutPages);
    const textPages = await extractTextPages(buffer);
    const parsed = parseTransactionsFromOcrPages(
      textPages.map((page) => ({
        ...page,
        checkRegions: []
      }))
    );

    applyLayoutSectionsToParsedTransactions(parsed, layoutPages, sectionBounds);

    const report = buildStatementValidationReport({
      statementId: 'fixture',
      rows: parsed as any,
      profile: 'southstate_fixture'
    });
    expect(report.passed).toBe(true);
    expect(report.actual.otherCreditsCount).toBe(19);
    expect(report.actual.electronicDebitsCount).toBe(38);
  }, 30000);
});
