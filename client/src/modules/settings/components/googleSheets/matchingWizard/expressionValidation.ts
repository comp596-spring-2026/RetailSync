import {
  DERIVED_DEFINITIONS,
  DERIVED_DEFAULT_FORMULAS,
  type DerivedConfig,
  type DerivedKey,
  type MappableTargetKey,
} from './mappingTypes';

const IDENTIFIER_REGEX = /[A-Za-z_][A-Za-z0-9_]*/g;

const ALLOWED_FUNCTIONS = new Set(['day', 'weekday', 'coalesce', 'round', 'abs', 'min', 'max', 'sum']);
const DERIVED_KEYS = new Set<DerivedKey>(Object.keys(DERIVED_DEFAULT_FORMULAS) as DerivedKey[]);
const TARGET_KEYS = new Set<MappableTargetKey>([
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'cashExpenses',
  'notes',
]);
const LEGACY_IDENTIFIER_ALIASES: Record<string, string> = {
  cash: 'cashDiff',
  clTotal: 'creditPlusLottery',
};

export type ExpressionValidationResult = {
  ok: boolean;
  unknownIdentifiers: string[];
};

export const validateExpression = (expression: string): ExpressionValidationResult => {
  const value = String(expression ?? '').trim();
  if (!value) {
    return { ok: false, unknownIdentifiers: [] };
  }

  const identifiers = value.match(IDENTIFIER_REGEX) ?? [];
  const unknownIdentifiers = Array.from(
    new Set(
      identifiers.filter(
        (id) => {
          const normalized = LEGACY_IDENTIFIER_ALIASES[id] ?? id;
          return (
            !TARGET_KEYS.has(normalized as MappableTargetKey) &&
            !DERIVED_KEYS.has(normalized as DerivedKey) &&
            !ALLOWED_FUNCTIONS.has(normalized)
          );
        },
      ),
    ),
  );

  return {
    ok: unknownIdentifiers.length === 0,
    unknownIdentifiers,
  };
};

export const getMissingDependencies = (
  key: DerivedKey,
  mappingByTarget: Record<MappableTargetKey, string | null>,
  derivedConfig: DerivedConfig,
): MappableTargetKey[] => {
  if (key === 'cashDiff') {
    const hasSaleTax = Boolean(mappingByTarget.saleTax);
    const hasGas = Boolean(mappingByTarget.gas);
    const hasLottery = Boolean(mappingByTarget.lottery);
    const hasCredit = Boolean(mappingByTarget.creditCard);
    const hasLotteryPayout = Boolean(mappingByTarget.lotteryPayout);
    const hasTotalSales =
      derivedConfig.totalSales.mode === 'calc' ||
      (derivedConfig.totalSales.mode === 'map' && Boolean(derivedConfig.totalSales.sheetColumnId));
    const hasHighLow = Boolean(mappingByTarget.highTax) && Boolean(mappingByTarget.lowTax);

    const missing: MappableTargetKey[] = [];
    if (!hasSaleTax) missing.push('saleTax');
    if (!hasGas) missing.push('gas');
    if (!hasLottery) missing.push('lottery');
    if (!hasCredit) missing.push('creditCard');
    if (!hasLotteryPayout) missing.push('lotteryPayout');
    if (!hasTotalSales && !hasHighLow) {
      if (!mappingByTarget.highTax) missing.push('highTax');
      if (!mappingByTarget.lowTax) missing.push('lowTax');
    }
    return missing;
  }

  const definition = DERIVED_DEFINITIONS.find((entry) => entry.key === key);
  if (!definition) return [];

  return definition.dependencies.filter((dependency) => !mappingByTarget[dependency]);
};
