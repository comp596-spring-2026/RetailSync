type CsvRow = Record<string, string | undefined>;

export type CanonicalTargetKey =
  | 'date'
  | 'day'
  | 'highTax'
  | 'lowTax'
  | 'saleTax'
  | 'totalSales'
  | 'gas'
  | 'lottery'
  | 'creditCard'
  | 'lotteryPayout'
  | 'creditPlusLottery'
  | 'cashDiff'
  | 'cashPayout'
  | 'cashExpenses'
  | 'notes';

export type CanonicalDerivedKey = 'day' | 'totalSales' | 'creditPlusLottery' | 'cashDiff';
type DerivedMode = 'calc' | 'map';

type DerivedConfigEntry = {
  mode: DerivedMode;
  equation: string;
  sheetColumnId: string | null;
};

export type NormalizedDerivedConfig = Record<CanonicalDerivedKey, DerivedConfigEntry>;

type EvaluationContext = Partial<Record<CanonicalTargetKey, string | number>>;

type EvaluateResult =
  | {
      ok: true;
      row: {
        date: string;
        day: string;
        highTax: number;
        lowTax: number;
        saleTax: number;
        totalSales: number;
        gas: number;
        lottery: number;
        creditCard: number;
        lotteryPayout: number;
        clTotal: number;
        cash: number;
        cashPayout: number;
        cashExpenses: number;
        notes: string;
      };
      derivedFieldsApplied: CanonicalDerivedKey[];
    }
  | {
      ok: false;
      reason: string;
      details?: Record<string, unknown>;
    };

const REQUIRED_RAW_TARGETS: CanonicalTargetKey[] = [
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'cashExpenses',
];

const DERIVED_DEFAULTS: Record<CanonicalDerivedKey, string> = {
  day: 'weekday(date)',
  totalSales: 'highTax + lowTax',
  creditPlusLottery: 'creditCard + lotteryPayout',
  cashDiff: 'totalSales + gas + lottery + saleTax - (creditCard + lotteryPayout)'
};

const DERIVED_ALIASES: Record<string, CanonicalDerivedKey> = {
  cash: 'cashDiff',
  clTotal: 'creditPlusLottery'
};

const TARGET_ALIASES: Record<string, CanonicalTargetKey> = {
  cash: 'cashDiff',
  clTotal: 'creditPlusLottery'
};

const DERIVED_KEYS = Object.keys(DERIVED_DEFAULTS) as CanonicalDerivedKey[];

const isNumberTarget = (key: CanonicalTargetKey) =>
  [
    'highTax',
    'lowTax',
    'saleTax',
    'totalSales',
    'gas',
    'lottery',
    'creditCard',
    'lotteryPayout',
    'creditPlusLottery',
    'cashDiff',
    'cashPayout',
    'cashExpenses'
  ].includes(key);

const dayFromDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC'
  });

const normalizeDate = (value: string) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const toOptionalNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const cleaned = String(value).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const normalizeTargetKey = (value: string): CanonicalTargetKey | null => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (TARGET_ALIASES[normalized]) return TARGET_ALIASES[normalized];
  if (
    normalized === 'date' ||
    normalized === 'day' ||
    normalized === 'highTax' ||
    normalized === 'lowTax' ||
    normalized === 'saleTax' ||
    normalized === 'totalSales' ||
    normalized === 'gas' ||
    normalized === 'lottery' ||
    normalized === 'creditCard' ||
    normalized === 'lotteryPayout' ||
    normalized === 'creditPlusLottery' ||
    normalized === 'cashDiff' ||
    normalized === 'cashExpenses' ||
    normalized === 'notes'
  ) {
    return normalized;
  }
  return null;
};

const normalizeDerivedKey = (value: string): CanonicalDerivedKey | null => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (DERIVED_ALIASES[normalized]) return DERIVED_ALIASES[normalized];
  if (DERIVED_KEYS.includes(normalized as CanonicalDerivedKey)) {
    return normalized as CanonicalDerivedKey;
  }
  return null;
};

const applyFallbacks = (context: EvaluationContext) => {
  const highTax = toOptionalNumber(context.highTax);
  const lowTax = toOptionalNumber(context.lowTax);
  if (context.totalSales == null && highTax != null && lowTax != null) {
    context.totalSales = highTax + lowTax;
  }

  const creditCard = toOptionalNumber(context.creditCard);
  const lotteryPayout = toOptionalNumber(context.lotteryPayout);
  if (context.creditPlusLottery == null && creditCard != null && lotteryPayout != null) {
    context.creditPlusLottery = creditCard + lotteryPayout;
  }
};

const hasMappedColumn = (value: string | null | undefined) => Boolean(String(value ?? '').trim());

const getMissingDerivedDependencies = (key: CanonicalDerivedKey, config: NormalizedDerivedConfig, mappedTargets: Set<CanonicalTargetKey>) => {
  const missing: CanonicalTargetKey[] = [];
  const need = (target: CanonicalTargetKey) => {
    if (!mappedTargets.has(target)) missing.push(target);
  };

  if (key === 'day') {
    need('date');
    return missing;
  }
  if (key === 'totalSales') {
    need('highTax');
    need('lowTax');
    return missing;
  }
  if (key === 'creditPlusLottery') {
    need('creditCard');
    need('lotteryPayout');
    return missing;
  }
  if (key === 'cashDiff') {
    need('saleTax');
    need('gas');
    need('lottery');
    need('creditCard');
    need('lotteryPayout');
    const totalSalesIsMappable =
      config.totalSales.mode === 'calc' ||
      (config.totalSales.mode === 'map' && hasMappedColumn(config.totalSales.sheetColumnId));
    if (!totalSalesIsMappable && !mappedTargets.has('highTax')) missing.push('highTax');
    if (!totalSalesIsMappable && !mappedTargets.has('lowTax')) missing.push('lowTax');
    return missing;
  }
  return missing;
};

const evaluateDerivedFixed = (key: CanonicalDerivedKey, context: EvaluationContext): number | string | null => {
  const n = (value: unknown) => toOptionalNumber(value);
  const totalSales = () => {
    const fromContext = n(context.totalSales);
    if (fromContext != null) return fromContext;
    const highTax = n(context.highTax);
    const lowTax = n(context.lowTax);
    if (highTax == null || lowTax == null) return null;
    return highTax + lowTax;
  };

  if (key === 'day') {
    const date = typeof context.date === 'string' ? context.date : '';
    return date ? dayFromDate(date) : null;
  }
  if (key === 'totalSales') {
    return totalSales();
  }
  if (key === 'creditPlusLottery') {
    const creditCard = n(context.creditCard);
    const lotteryPayout = n(context.lotteryPayout);
    if (creditCard == null || lotteryPayout == null) return null;
    return creditCard + lotteryPayout;
  }
  if (key === 'cashDiff') {
    const sales = totalSales();
    const gas = n(context.gas);
    const lottery = n(context.lottery);
    const saleTax = n(context.saleTax);
    const creditCard = n(context.creditCard);
    const lotteryPayout = n(context.lotteryPayout);
    if (
      sales == null ||
      gas == null ||
      lottery == null ||
      saleTax == null ||
      creditCard == null ||
      lotteryPayout == null
    ) {
      return null;
    }
    return sales + gas + lottery + saleTax - (creditCard + lotteryPayout);
  }
  return null;
};

export const normalizeDerivedConfig = (
  transformations: Record<string, unknown> | undefined,
  mapping: Record<string, string>,
): NormalizedDerivedConfig => {
  const base: NormalizedDerivedConfig = {
    day: { mode: 'calc', equation: DERIVED_DEFAULTS.day, sheetColumnId: null },
    totalSales: { mode: 'calc', equation: DERIVED_DEFAULTS.totalSales, sheetColumnId: null },
    creditPlusLottery: { mode: 'calc', equation: DERIVED_DEFAULTS.creditPlusLottery, sheetColumnId: null },
    cashDiff: { mode: 'calc', equation: DERIVED_DEFAULTS.cashDiff, sheetColumnId: null }
  };

  const rawConfig = transformations?.__derivedConfig;
  if (rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig)) {
    for (const key of DERIVED_KEYS) {
      const candidates = key === 'cashDiff' ? ['cashDiff', 'cash'] : key === 'creditPlusLottery' ? ['creditPlusLottery', 'clTotal'] : [key];
      const candidate = candidates
        .map((entry) => (rawConfig as Record<string, unknown>)[entry])
        .find((entry) => entry != null);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) continue;

      const modeRaw = String((candidate as Record<string, unknown>).mode ?? '').toLowerCase();
      const mode: DerivedMode = modeRaw === 'map' || modeRaw === 'calc' ? modeRaw : base[key].mode;
      base[key] = {
        mode,
        equation: DERIVED_DEFAULTS[key],
        sheetColumnId:
          (candidate as Record<string, unknown>).sheetColumnId == null
            ? null
            : String((candidate as Record<string, unknown>).sheetColumnId)
      };
    }
  }

  for (const [columnId, rawTarget] of Object.entries(mapping ?? {})) {
    const derivedKey = normalizeDerivedKey(rawTarget);
    if (!derivedKey) continue;
    if (derivedKey === 'cashDiff') continue;
    base[derivedKey].mode = 'map';
    base[derivedKey].sheetColumnId = String(columnId);
  }

  base.cashDiff.mode = 'calc';
  base.cashDiff.sheetColumnId = null;
  base.cashDiff.equation = DERIVED_DEFAULTS.cashDiff;

  return base;
};

export const validateDerivedConfiguration = (params: {
  headers: string[];
  mapping: Record<string, string>;
  transformations?: Record<string, unknown>;
}) => {
  const normalizedMapping = Object.fromEntries(
    Object.entries(params.mapping ?? {}).map(([columnId, target]) => [String(columnId), String(target)]),
  );
  const derivedConfig = normalizeDerivedConfig(params.transformations, normalizedMapping);
  const mappedTargets = new Set<CanonicalTargetKey>();
  for (const target of Object.values(normalizedMapping)) {
    const normalized = normalizeTargetKey(target);
    if (normalized) mappedTargets.add(normalized);
  }

  const errors: string[] = [];
  const duplicateColumns: string[] = [];
  const columnUsage = new Map<string, string[]>();

  for (const [columnId, target] of Object.entries(normalizedMapping)) {
    const usage = columnUsage.get(columnId) ?? [];
    usage.push(target);
    columnUsage.set(columnId, usage);
    if ((normalizeTargetKey(target) ?? normalizeDerivedKey(target)) === 'cashDiff') {
      errors.push('unsupported_direct_mapping:cashDiff');
    }
  }

  for (const key of DERIVED_KEYS) {
    const entry = derivedConfig[key];
    if (entry.mode === 'map' && entry.sheetColumnId) {
      const usage = columnUsage.get(entry.sheetColumnId) ?? [];
      usage.push(`derived:${key}`);
      columnUsage.set(entry.sheetColumnId, usage);
    }
  }

  for (const [columnId, usedBy] of columnUsage.entries()) {
    if (usedBy.length > 1) duplicateColumns.push(`${columnId} (${usedBy.join(', ')})`);
  }
  if (duplicateColumns.length > 0) {
    errors.push(`duplicate_columns:${duplicateColumns.join('; ')}`);
  }

  for (const target of REQUIRED_RAW_TARGETS) {
    if (!mappedTargets.has(target)) {
      errors.push(`missing_required:${target}`);
    }
  }

  for (const key of DERIVED_KEYS) {
    const entry = derivedConfig[key];
    if (entry.mode === 'map') {
      if (!entry.sheetColumnId) {
        errors.push(`derived_map_missing_column:${key}`);
        continue;
      }
      const found = params.headers.some((header) => header.toLowerCase() === entry.sheetColumnId?.toLowerCase());
      if (!found) {
        errors.push(`derived_map_column_not_found:${key}:${entry.sheetColumnId}`);
      }
      continue;
    }
    const missingDependencies = getMissingDerivedDependencies(key, derivedConfig, mappedTargets);
    if (missingDependencies.length > 0) {
      errors.push(`derived_missing_dependencies:${key}:${missingDependencies.join(',')}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    derivedConfig
  };
};

export const evaluateConfiguredPosRow = (params: {
  row: CsvRow;
  mapping: Record<string, string>;
  transformations?: Record<string, unknown>;
}): EvaluateResult => {
  const mapping = Object.fromEntries(
    Object.entries(params.mapping ?? {}).map(([columnId, target]) => [String(columnId), String(target)]),
  );
  const derivedConfig = normalizeDerivedConfig(params.transformations, mapping);
  const context: EvaluationContext = {};
  for (const [sourceHeader, rawTarget] of Object.entries(mapping)) {
    const target = normalizeTargetKey(rawTarget) ?? normalizeDerivedKey(rawTarget);
    if (!target) continue;
    const rawValue = params.row[sourceHeader];
    if (rawValue == null) continue;

    if (target === 'date') {
      const normalizedDate = normalizeDate(rawValue);
      if (normalizedDate != null) context.date = normalizedDate;
      continue;
    }
    if (target === 'notes') {
      context.notes = String(rawValue ?? '').trim();
      continue;
    }
    if (target === 'day') {
      const value = String(rawValue ?? '').trim();
      if (value) context.day = value;
      continue;
    }

    if (isNumberTarget(target as CanonicalTargetKey)) {
      if (target === 'cashDiff') continue;
      const numberValue = toOptionalNumber(rawValue);
      if (numberValue != null) context[target as CanonicalTargetKey] = numberValue;
    }
  }

  for (const key of DERIVED_KEYS) {
    const entry = derivedConfig[key];
    if (entry.mode !== 'map' || !entry.sheetColumnId) continue;
    const rawValue = params.row[entry.sheetColumnId];
    if (rawValue == null) continue;
    if (key === 'day') {
      const value = String(rawValue).trim();
      if (value) context.day = value;
      continue;
    }
    const numberValue = toOptionalNumber(rawValue);
    if (numberValue != null) context[key] = numberValue;
  }

  applyFallbacks(context);

  const fixedEvaluationOrder: CanonicalDerivedKey[] = [
    'day',
    'totalSales',
    'creditPlusLottery',
    'cashDiff'
  ];

  for (const key of fixedEvaluationOrder) {
    if (derivedConfig[key].mode !== 'calc') continue;
    const value = evaluateDerivedFixed(key, context);
    if (key === 'day') {
      if (typeof value !== 'string' || !value.trim()) {
        return { ok: false, reason: `Derived field ${key} produced invalid value` };
      }
      context[key] = value.trim();
      continue;
    }
    const numberValue = toOptionalNumber(value);
    if (numberValue == null) {
      return { ok: false, reason: `Derived field ${key} produced invalid numeric value` };
    }
    context[key] = numberValue;
    applyFallbacks(context);
  }

  const date = normalizeDate(String(context.date ?? ''));
  if (!date) return { ok: false, reason: 'Date is missing or invalid' };

  for (const target of REQUIRED_RAW_TARGETS.filter((entry) => entry !== 'date' && entry !== 'cashExpenses')) {
    if (toOptionalNumber(context[target]) == null) {
      return { ok: false, reason: `Required target ${target} is missing` };
    }
  }

  const highTax = toOptionalNumber(context.highTax) ?? 0;
  const lowTax = toOptionalNumber(context.lowTax) ?? 0;
  const saleTax = toOptionalNumber(context.saleTax) ?? 0;
  const gas = toOptionalNumber(context.gas) ?? 0;
  const lottery = toOptionalNumber(context.lottery) ?? 0;
  const creditCard = toOptionalNumber(context.creditCard) ?? 0;
  const lotteryPayout = toOptionalNumber(context.lotteryPayout) ?? 0;
  const totalSales = toOptionalNumber(context.totalSales) ?? (highTax + lowTax);
  const creditPlusLottery = toOptionalNumber(context.creditPlusLottery) ?? (creditCard + lotteryPayout);
  const cashDiff =
    toOptionalNumber(context.cashDiff) ??
    (totalSales + gas + lottery + saleTax - (creditCard + lotteryPayout));
  const cashPayout = toOptionalNumber(context.cashPayout) ?? 0;
  const cashExpenses = toOptionalNumber(context.cashExpenses) ?? 0;
  const notes = String(context.notes ?? '').trim();
  const day = String(context.day ?? dayFromDate(date)).trim() || dayFromDate(date);

  return {
    ok: true,
    row: {
      date,
      day,
      highTax,
      lowTax,
      saleTax,
      totalSales,
      gas,
      lottery,
      creditCard,
      lotteryPayout,
      clTotal: creditPlusLottery,
      cash: cashDiff,
      cashPayout,
      cashExpenses,
      notes
    },
    derivedFieldsApplied: DERIVED_KEYS
  };
};
