import { beforeEach, describe, expect, it, vi } from 'vitest';

const quickBooksFind = vi.fn();
const ledgerFind = vi.fn();

vi.mock('../models/QuickBooksReference', () => ({
  QuickBooksReferenceModel: {
    find: (...args: unknown[]) => quickBooksFind(...args)
  }
}));

vi.mock('../models/LedgerEntry', () => ({
  LedgerEntryModel: {
    find: (...args: unknown[]) => ledgerFind(...args)
  }
}));

describe('matchingEngine', () => {
  beforeEach(() => {
    quickBooksFind.mockReset();
    ledgerFind.mockReset();

    quickBooksFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([
        {
          entityType: 'vendor',
          qbId: 'vendor-1',
          displayName: 'ACME Supplies'
        }
      ])
    });

    ledgerFind.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([])
    });
  });

  it('uses OCR-derived check fields and vendor resolution when building a proposal', async () => {
    const { buildMatchingProposal } = await import('./matchingEngine');

    const result = await buildMatchingProposal({
      companyId: 'company-1',
      description: 'Office supply expense',
      merchant: 'ACME Supplies',
      amount: 125,
      type: 'debit',
      check: {
        extracted: {
          checkNumber: '1001',
          date: '2026-01-03',
          payeeName: 'ACME Supplies',
          amount: 125,
          memo: 'Payroll supplies'
        }
      }
    });

    expect(result.qbTxnType).toBe('Check');
    expect(result.payeeType).toBe('vendor');
    expect(result.payeeName).toBe('ACME Supplies');
    expect(result.confidence).toBeGreaterThanOrEqual(0.45);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Entity resolution: ACME Supplies'),
        expect.stringContaining('Check number signal: 1001'),
        expect.stringContaining('Check date signal: 2026-01-03'),
        expect.stringContaining('Check memo signal: Payroll supplies')
      ])
    );
  });
});
