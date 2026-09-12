import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { fixturePdfPath, runStatementFixtureExtraction } from './runStatementFixtureExtraction';

const hasPdfToPpm = () => {
  const result = spawnSync('pdftoppm', ['-h'], {
    encoding: 'utf8',
    timeout: 5000
  });
  return !result.error;
};

describe('SouthState fixture strict validation', () => {
  it('matches SouthState truth exactly', async () => {
    if (!hasPdfToPpm() || !existsSync(fixturePdfPath)) {
      return;
    }

    const summary = await runStatementFixtureExtraction();
    const report = summary.validationReport;

    expect(report.passed).toBe(true);
    expect(report.actual.beginningBalance).toBe(15062.62);
    expect(report.actual.endingBalance).toBe(19830.01);
    expect(report.actual.depositsCount).toBe(9);
    expect(report.actual.depositsTotal).toBe(36600);
    expect(report.actual.electronicCreditsCount).toBe(5);
    expect(report.actual.electronicCreditsTotal).toBe(5305.39);
    expect(report.actual.otherCreditsCount).toBe(19);
    expect(report.actual.otherCreditsTotal).toBe(45143.95);
    expect(report.actual.electronicDebitsCount).toBe(38);
    expect(report.actual.electronicDebitsTotal).toBe(49537.95);
    expect(report.actual.checksCount).toBe(44);
    expect(report.actual.checksTotal).toBe(32744);
    expect(report.actual.dailyBalancesCount).toBe(22);

    const transactionsPath = path.join(summary.outputRoot, summary.tableJsonPaths.transactions);
    const rows = JSON.parse(await fs.readFile(transactionsPath, 'utf8')) as Array<{
      rowType: string;
      isPostingCandidate: boolean;
      sourceLocator?: { pageNumber?: number };
    }>;
    const postingCandidateRowTypes = new Set([
      'deposit',
      'electronic_credit',
      'other_credit',
      'electronic_debit',
      'check_cleared'
    ]);
    const checkImageLeakRows = rows.filter((row) => {
      const page = Number(row.sourceLocator?.pageNumber ?? 0);
      return page >= 4 && page <= 6 && postingCandidateRowTypes.has(row.rowType);
    });
    expect(checkImageLeakRows).toHaveLength(0);

    const checksClearedRows = rows.filter((row) => row.rowType === 'check_cleared');
    expect(checksClearedRows).toHaveLength(44);
    const checksFromCheckImagePages = checksClearedRows.filter((row) => {
      const page = Number(row.sourceLocator?.pageNumber ?? 0);
      return page >= 4 && page <= 6;
    });
    expect(checksFromCheckImagePages).toHaveLength(0);

    // Coordinate-aware extractor (pdf.js-extract) must resolve sections on the
    // expected pages so downstream tooling can use section bounds with confidence.
    const sectionBounds = summary.pdfLayoutSectionBounds as Array<{
      pageNumber: number;
      section: string;
    }>;
    const pagesBySection = sectionBounds.reduce<Record<string, number[]>>((acc, b) => {
      acc[b.section] = acc[b.section] ?? [];
      acc[b.section].push(b.pageNumber);
      return acc;
    }, {});
    expect(pagesBySection.account_summary).toContain(1);
    expect(pagesBySection.deposits).toContain(1);
    expect(pagesBySection.electronic_credits).toContain(1);
    expect(pagesBySection.other_credits).toContain(1);
    expect(pagesBySection.other_credits).toContain(2);
    expect(pagesBySection.electronic_debits).toContain(2);
    expect(pagesBySection.checks_cleared).toEqual([3]);
    expect(pagesBySection.daily_balances).toEqual([3]);

    // buildTransactionSections must carry the layoutSections hint snapped from
    // pdf.js-extract bounds so every page that holds classified rows knows
    // which section headers actually live on that page.
    const sectionsPath = path.join(summary.outputRoot, summary.tableJsonPaths.transactionSections);
    const pageSections = JSON.parse(await fs.readFile(sectionsPath, 'utf8')) as Array<{
      pageNumber: number;
      layoutSections?: Array<{ section: string }>;
    }>;
    const layoutSectionsByPage = new Map<number, string[]>();
    for (const entry of pageSections) {
      layoutSectionsByPage.set(
        entry.pageNumber,
        (entry.layoutSections ?? []).map((ls) => ls.section)
      );
    }
    expect(layoutSectionsByPage.get(1) ?? []).toEqual(
      expect.arrayContaining(['account_summary', 'deposits', 'electronic_credits', 'other_credits'])
    );
    expect(layoutSectionsByPage.get(2) ?? []).toEqual(
      expect.arrayContaining(['other_credits', 'electronic_debits'])
    );
    expect(layoutSectionsByPage.get(3) ?? []).toEqual(
      expect.arrayContaining(['checks_cleared', 'daily_balances'])
    );
    // Check-image pages must not carry any posting-related layout sections.
    for (const page of [4, 5, 6]) {
      const layoutSections = layoutSectionsByPage.get(page) ?? [];
      expect(layoutSections).not.toContain('deposits');
      expect(layoutSections).not.toContain('electronic_credits');
      expect(layoutSections).not.toContain('other_credits');
      expect(layoutSections).not.toContain('electronic_debits');
      expect(layoutSections).not.toContain('daily_balances');
    }

    // buildChecksClearedRows must annotate check rows with their resolved layout section
    // so downstream classifiers can trust the coordinate anchor instead of text heuristics.
    const checksClearedPath = path.join(summary.outputRoot, summary.tableJsonPaths.checksCleared);
    const annotatedChecks = JSON.parse(await fs.readFile(checksClearedPath, 'utf8')) as Array<{
      checkNumber: string | null;
      layoutSection: string | null;
      checkNumberSource?: string;
    }>;
    expect(annotatedChecks).toHaveLength(44);
    for (const row of annotatedChecks) {
      expect(row.layoutSection).toBe('checks_cleared');
      expect(row.checkNumber).toMatch(/^\d{4}$/);
      expect(['text_parser', 'pdf_layout']).toContain(row.checkNumberSource ?? '');
    }

    // Coordinate-based check table from pdf.js-extract must contain 44 unique
    // numbered checks totalling exactly 32,744.00 on page 3.
    const coordinateChecks = summary.pdfLayoutChecks as Array<{
      checkNumber: string;
      date: string;
      amount: number;
      pageNumber: number;
    }>;
    expect(coordinateChecks).toHaveLength(44);
    expect(new Set(coordinateChecks.map((row) => row.checkNumber)).size).toBe(44);
    const coordinateChecksTotal = coordinateChecks.reduce((sum, row) => sum + row.amount, 0);
    expect(Number(coordinateChecksTotal.toFixed(2))).toBe(32744);
    for (const row of coordinateChecks) {
      expect(row.pageNumber).toBe(3);
    }

    // Coordinate-based daily-balances table must produce exactly 22 per-day rows
    // on page 3, with ending balance 19,830.01 on 2025-12-31.
    const coordinateBalances = summary.pdfLayoutDailyBalances as Array<{
      date: string;
      amount: number;
      pageNumber: number;
    }>;
    expect(coordinateBalances).toHaveLength(22);
    for (const row of coordinateBalances) {
      expect(row.pageNumber).toBe(3);
    }
    const endingBalanceRow = coordinateBalances.find((row) => row.date === '2025-12-31');
    expect(endingBalanceRow?.amount).toBe(19830.01);
  }, 180000);
});
