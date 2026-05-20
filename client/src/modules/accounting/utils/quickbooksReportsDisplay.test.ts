import { describe, expect, it } from 'vitest';
import { buildExecutiveKpis, formatMoneyDisplay, reportRowsAllEmpty } from './quickbooksReportsDisplay';

describe('quickbooksReportsDisplay', () => {
  it('renders missing money as No value', () => {
    expect(formatMoneyDisplay(null).text).toBe('No value');
    expect(formatMoneyDisplay(undefined).text).toBe('No value');
  });

  it('renders zero as currency', () => {
    expect(formatMoneyDisplay(0).text).toBe('$0.00');
    expect(formatMoneyDisplay(0).isZero).toBe(true);
  });

  it('detects empty report rows', () => {
    expect(
      reportRowsAllEmpty([
        { label: 'Revenue', amount: null, path: [] },
        { label: 'Expenses', amount: null, path: [] }
      ])
    ).toBe(true);
  });

  it('builds executive KPI helpers for missing net income', () => {
    const kpis = buildExecutiveKpis({
      from: '2026-01-01',
      to: '2026-05-20',
      basis: 'accrual',
      cards: {
        netIncome: null,
        totalAssets: 22840.04,
        totalLiabilities: 22840.04,
        totalEquity: -8291.29,
        arOpen: null,
        apOpen: null
      }
    });
    expect(kpis[0].money.text).toBe('No value');
    expect(kpis[3].helper).toMatch(/Negative equity/i);
  });
});
