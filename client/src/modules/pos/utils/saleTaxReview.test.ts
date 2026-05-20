import { describe, expect, it } from 'vitest';
import type { PosDailyRecord } from '../api';
import {
  buildSalesTaxReviewIndex,
  calculateGeorgiaVendorCompensation
} from './saleTaxReview';

const buildRow = (overrides: Partial<PosDailyRecord>): PosDailyRecord => ({
  _id: overrides._id ?? Math.random().toString(36),
  date: overrides.date ?? '2026-04-01',
  day: overrides.day ?? 'Wed',
  highTax: overrides.highTax ?? 0,
  lowTax: overrides.lowTax ?? 0,
  saleTax: overrides.saleTax ?? 0,
  totalSales: overrides.totalSales ?? (Number(overrides.highTax ?? 0) + Number(overrides.lowTax ?? 0)),
  gas: overrides.gas ?? 0,
  lottery: overrides.lottery ?? 0,
  creditCard: overrides.creditCard ?? 0,
  lotteryPayout: overrides.lotteryPayout ?? 0,
  clTotal: overrides.clTotal ?? 0,
  cash: overrides.cash ?? 0,
  cashPayout: overrides.cashPayout ?? 0,
  cashExpenses: overrides.cashExpenses ?? 0,
  notes: overrides.notes ?? '',
  source: overrides.source ?? 'google_sheets',
  importBindingKey: overrides.importBindingKey ?? null,
  sourceRef: overrides.sourceRef ?? null
});

describe('saleTaxReview', () => {
  it('calculates Georgia vendor compensation with bracket logic', () => {
    expect(calculateGeorgiaVendorCompensation(2500)).toEqual({
      firstBracketBase: 2500,
      firstBracketCompensation: 75,
      overBracketBase: 0,
      overBracketCompensation: 0,
      total: 75
    });

    expect(calculateGeorgiaVendorCompensation(3500)).toEqual({
      firstBracketBase: 3000,
      firstBracketCompensation: 90,
      overBracketBase: 500,
      overBracketCompensation: 2.5,
      total: 92.5
    });
  });

  it('groups rows into monthly reviews and flags notes for review', () => {
    const index = buildSalesTaxReviewIndex([
      buildRow({
        _id: 'apr-1',
        date: '2026-04-01',
        day: 'Wed',
        highTax: 1000,
        lowTax: 500,
        saleTax: 85,
        gas: 30,
        lottery: 20,
        creditCard: 700,
        lotteryPayout: 5,
        cashExpenses: 10
      }),
      buildRow({
        _id: 'apr-2',
        date: '2026-04-02',
        day: 'Thu',
        highTax: 500,
        lowTax: 100,
        saleTax: 38,
        gas: 25,
        lottery: 15,
        creditCard: 400,
        lotteryPayout: 2,
        cashExpenses: 8,
        notes: 'Check register variance'
      }),
      buildRow({
        _id: 'nov-1',
        date: '2025-11-03',
        day: 'Mon',
        highTax: 300,
        lowTax: 0,
        saleTax: 21,
        gas: 10,
        lottery: 5,
        creditCard: 200,
        lotteryPayout: 0,
        cashExpenses: 3
      })
    ]);

    expect(index.availableYears).toEqual([2025, 2026]);
    expect(index.latestYear).toBe(2026);
    expect(index.monthlyReviewsByYear[2026]).toHaveLength(1);

    const aprilReview = index.monthlyReviewsByYear[2026][0];
    expect(aprilReview.monthLabel).toBe('April 2026');
    expect(aprilReview.calculatedSalesTax).toBe(123);
    expect(aprilReview.saleTaxCollected).toBe(123);
    expect(aprilReview.status).toBe('needs_review');
    expect(aprilReview.notesCount).toBe(1);
    expect(aprilReview.validationChecks.some((check) => check.level === 'warning')).toBe(true);
  });
});
