import { describe, expect, it } from 'vitest';
import {
  getCompatibility,
  normalizeDerivedConfig,
  setColumnForDerivedMap,
  setColumnForTarget,
  toMappingByTarget,
} from './mappingLogic';

describe('mappingLogic', () => {
  it('setColumnForTarget enforces unique sheet column per target', () => {
    const base = {
      date: 'DATE',
      highTax: 'HIGH TAX',
      lowTax: null,
      saleTax: null,
      gas: null,
      lottery: null,
      creditCard: null,
      lotteryPayout: null,
      cashExpenses: null,
      notes: null,
    } as const;

    const next = setColumnForTarget(base, 'highTax', 'DATE');

    expect(next.highTax).toBe('DATE');
    expect(next.date).toBeNull();
  });

  it('setColumnForDerivedMap clears conflicting target mapping', () => {
    const mappingByTarget = toMappingByTarget({ DATE: 'date', GAS: 'gas' });
    const derivedConfig = normalizeDerivedConfig({});

    const result = setColumnForDerivedMap(derivedConfig, mappingByTarget, 'cashDiff', 'DATE');

    expect(result.derivedConfig.cashDiff.sheetColumnId).toBe('DATE');
    expect(result.mappingByTarget.date).toBeNull();
  });

  it('reports missing required targets and invalid derived calc dependencies', () => {
    const mappingByTarget = toMappingByTarget({ DATE: 'date', CREDIT: 'creditCard' });
    const derivedConfig = {
      ...normalizeDerivedConfig({}),
      cashDiff: {
        mode: 'calc' as const,
        equation: 'totalSales + gas + lottery + saleTax - (creditCard + lotteryPayout)',
        sheetColumnId: null,
      },
    };

    const compatibility = getCompatibility({
      mappingByTarget,
      derivedConfig,
      headers: ['DATE', 'CREDIT'],
    });

    expect(compatibility.isValid).toBe(false);
    expect(compatibility.missingRequiredTargets).toEqual(
      expect.arrayContaining(['highTax', 'lowTax', 'saleTax', 'gas', 'lottery', 'lotteryPayout']),
    );
    expect(compatibility.derivedDependencyIssues.some((issue) => issue.key === 'cashDiff')).toBe(true);
  });
});
