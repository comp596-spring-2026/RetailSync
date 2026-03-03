import { getMissingDependencies, validateExpression } from './expressionValidation';
import {
  DERIVED_DEFAULT_FORMULAS,
  MAPPABLE_TARGET_KEYS,
  REQUIRED_TARGET_KEYS,
  type DerivedConfig,
  type DerivedKey,
  type MappingByColumn,
  type MappingByTarget,
  type MappingCompatibility,
  type MappableTargetKey,
} from './mappingTypes';

const normalizeTarget = (value: string) => String(value ?? '').trim();
const IDENTIFIER_REGEX = /[A-Za-z_][A-Za-z0-9_]*/g;
const normalizeDerivedKeyAlias = (value: string): DerivedKey | null => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  if (normalized === 'cash') return 'cashDiff';
  if (normalized === 'clTotal') return 'creditPlusLottery';
  if (
    normalized === 'day' ||
    normalized === 'totalSales' ||
    normalized === 'creditPlusLottery' ||
    normalized === 'cashDiff'
  ) {
    return normalized;
  }
  return null;
};

const getExpressionDerivedDependencies = (equation: string): DerivedKey[] =>
  Array.from(
    new Set(
      (String(equation ?? '').match(IDENTIFIER_REGEX) ?? [])
        .map((entry) => normalizeDerivedKeyAlias(entry))
        .filter((entry): entry is DerivedKey => entry != null),
    ),
  );

const hasDerivedCycle = (derivedConfig: DerivedConfig): boolean => {
  const nodes = (Object.keys(derivedConfig) as DerivedKey[]).filter((key) => derivedConfig[key].mode === 'calc');
  const adjacency = new Map<DerivedKey, Set<DerivedKey>>();
  const indegree = new Map<DerivedKey, number>();

  for (const node of nodes) {
    adjacency.set(node, new Set());
    indegree.set(node, 0);
  }

  for (const node of nodes) {
    for (const dep of getExpressionDerivedDependencies(derivedConfig[node].equation)) {
      if (!adjacency.has(dep) || dep === node) continue;
      if (!adjacency.get(dep)?.has(node)) {
        adjacency.get(dep)?.add(node);
        indegree.set(node, (indegree.get(node) ?? 0) + 1);
      }
    }
  }

  const queue = nodes.filter((node) => (indegree.get(node) ?? 0) === 0);
  const sorted: DerivedKey[] = [];
  while (queue.length > 0) {
    const node = queue.shift() as DerivedKey;
    sorted.push(node);
    for (const next of adjacency.get(node) ?? []) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if ((indegree.get(next) ?? 0) === 0) queue.push(next);
    }
  }

  return sorted.length !== nodes.length;
};

const hasHeader = (headers: string[], header: string) =>
  headers.some((entry) => entry.toLowerCase() === header.toLowerCase());

export const createEmptyMappingByTarget = (): MappingByTarget => ({
  date: null,
  highTax: null,
  lowTax: null,
  saleTax: null,
  gas: null,
  lottery: null,
  creditCard: null,
  lotteryPayout: null,
  cashExpenses: null,
  notes: null,
});

export const toMappingByTarget = (mappingByColumn: MappingByColumn): MappingByTarget => {
  const next = createEmptyMappingByTarget();

  for (const [columnId, target] of Object.entries(mappingByColumn ?? {})) {
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget) continue;
    if (!MAPPABLE_TARGET_KEYS.includes(normalizedTarget as MappableTargetKey)) continue;
    const key = normalizedTarget as MappableTargetKey;
    if (!next[key]) {
      next[key] = String(columnId);
    }
  }

  return next;
};

export const toMappingByColumn = (mappingByTarget: MappingByTarget): MappingByColumn => {
  const next: MappingByColumn = {};

  for (const key of MAPPABLE_TARGET_KEYS) {
    const columnId = mappingByTarget[key];
    if (!columnId) continue;
    next[columnId] = key;
  }

  return next;
};

export const invertMapping = (mappingByColumn: MappingByColumn): Record<string, string> => {
  const next: Record<string, string> = {};
  for (const [columnId, target] of Object.entries(mappingByColumn ?? {})) {
    const normalizedTarget = normalizeTarget(target);
    if (!normalizedTarget) continue;
    next[normalizedTarget] = String(columnId);
  }
  return next;
};

export const normalizeMapping = (_headers: string[], mappingByColumn: MappingByColumn): MappingByColumn =>
  toMappingByColumn(toMappingByTarget(mappingByColumn));

export const setColumnForTarget = (
  mappingByTarget: MappingByTarget,
  targetKey: MappableTargetKey,
  columnIdOrNull: string | null,
): MappingByTarget => {
  const next: MappingByTarget = { ...mappingByTarget };
  const normalizedColumn = columnIdOrNull ? String(columnIdOrNull).trim() : '';

  for (const key of MAPPABLE_TARGET_KEYS) {
    if (next[key] === normalizedColumn) {
      next[key] = null;
    }
  }

  next[targetKey] = normalizedColumn || null;
  return next;
};

const createDefaultDerivedConfig = (): DerivedConfig => ({
  day: { mode: 'calc', equation: DERIVED_DEFAULT_FORMULAS.day, sheetColumnId: null },
  totalSales: { mode: 'calc', equation: DERIVED_DEFAULT_FORMULAS.totalSales, sheetColumnId: null },
  creditPlusLottery: { mode: 'calc', equation: DERIVED_DEFAULT_FORMULAS.creditPlusLottery, sheetColumnId: null },
  cashDiff: { mode: 'calc', equation: DERIVED_DEFAULT_FORMULAS.cashDiff, sheetColumnId: null },
});

export const normalizeDerivedConfig = (
  transforms: Record<string, unknown>,
  mappingByColumn?: MappingByColumn,
): DerivedConfig => {
  const base = createDefaultDerivedConfig();
  const raw = transforms?.__derivedConfig;

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const baseKey of Object.keys(base) as DerivedKey[]) {
      const rawKeyCandidates =
        baseKey === 'cashDiff' ? ['cashDiff', 'cash'] : baseKey === 'creditPlusLottery' ? ['creditPlusLottery', 'clTotal'] : [baseKey];
      const item = rawKeyCandidates
        .map((candidate) => (raw as Record<string, unknown>)[candidate])
        .find((entry) => entry != null);
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const modeRaw = String((item as Record<string, unknown>).mode ?? '').toLowerCase();
      const mode = modeRaw === 'map' || modeRaw === 'calc' ? modeRaw : base[baseKey].mode;
      base[baseKey] = {
        mode,
        equation: DERIVED_DEFAULT_FORMULAS[baseKey],
        sheetColumnId:
          (item as Record<string, unknown>).sheetColumnId == null
            ? null
            : String((item as Record<string, unknown>).sheetColumnId),
      };
    }
  } else {
    // No off mode. Keep all derived fields active in calc unless explicitly mapped.
  }

  if (mappingByColumn) {
  for (const [columnId, target] of Object.entries(mappingByColumn)) {
    const key = normalizeDerivedKeyAlias(target);
    if (!key) continue;
    if (key === 'cashDiff') continue;
    base[key].mode = 'map';
    base[key].sheetColumnId = columnId;
  }
  }

  return base;
};

export const setDerivedMode = (derivedConfig: DerivedConfig, key: DerivedKey, mode: 'calc' | 'map'): DerivedConfig => {
  const next: DerivedConfig = { ...derivedConfig, [key]: { ...derivedConfig[key] } };

  if (mode === 'calc') {
    next[key].mode = 'calc';
    next[key].sheetColumnId = null;
    if (!next[key].equation) {
      next[key].equation = DERIVED_DEFAULT_FORMULAS[key];
    }
    return next;
  }

  next[key].mode = 'map';
  return next;
};

export const setDerivedEquation = (derivedConfig: DerivedConfig, key: DerivedKey, equation: string): DerivedConfig => ({
  ...derivedConfig,
  [key]: {
    ...derivedConfig[key],
    equation,
  },
});

export const setColumnForDerivedMap = (
  derivedConfig: DerivedConfig,
  mappingByTarget: MappingByTarget,
  key: DerivedKey,
  columnIdOrNull: string | null,
): { derivedConfig: DerivedConfig; mappingByTarget: MappingByTarget } => {
  const normalizedColumn = columnIdOrNull ? String(columnIdOrNull).trim() : null;
  const nextDerived: DerivedConfig = {
    ...derivedConfig,
    [key]: {
      ...derivedConfig[key],
      mode: 'map',
      sheetColumnId: normalizedColumn,
    },
  };
  const nextMapping: MappingByTarget = { ...mappingByTarget };

  for (const targetKey of MAPPABLE_TARGET_KEYS) {
    if (nextMapping[targetKey] && nextMapping[targetKey] === normalizedColumn) {
      nextMapping[targetKey] = null;
    }
  }

  for (const derivedKey of Object.keys(nextDerived) as DerivedKey[]) {
    if (derivedKey === key) continue;
    const entry = nextDerived[derivedKey];
    if (entry.mode === 'map' && normalizedColumn && entry.sheetColumnId === normalizedColumn) {
      nextDerived[derivedKey] = {
        ...entry,
        sheetColumnId: null,
      };
    }
  }

  return {
    derivedConfig: nextDerived,
    mappingByTarget: nextMapping,
  };
};

export const getDerivedAppliedKeys = (derivedConfig: DerivedConfig): DerivedKey[] =>
  (Object.keys(derivedConfig) as DerivedKey[]);

export const serializeDerivedConfig = (derivedConfig: DerivedConfig): Record<string, unknown> => ({
  __derivedConfig: derivedConfig,
  __derivedFields: getDerivedAppliedKeys(derivedConfig),
});

export const getCompatibility = (params: {
  mappingByTarget: MappingByTarget;
  derivedConfig: DerivedConfig;
  headers: string[];
}): MappingCompatibility => {
  const { mappingByTarget, derivedConfig, headers } = params;

  const missingRequiredTargets = REQUIRED_TARGET_KEYS.filter((target) => !mappingByTarget[target]);

  const usage = new Map<string, string[]>();
  for (const key of MAPPABLE_TARGET_KEYS) {
    const columnId = mappingByTarget[key];
    if (!columnId) continue;
    const list = usage.get(columnId) ?? [];
    list.push(key);
    usage.set(columnId, list);
  }

  for (const key of Object.keys(derivedConfig) as DerivedKey[]) {
    const entry = derivedConfig[key];
    if (entry.mode !== 'map' || !entry.sheetColumnId) continue;
    const list = usage.get(entry.sheetColumnId) ?? [];
    list.push(`derived:${key}`);
    usage.set(entry.sheetColumnId, list);
  }
  const duplicateColumnUsage = Array.from(usage.entries())
    .filter(([, usedBy]) => usedBy.length > 1)
    .map(([columnId, usedBy]) => ({ columnId, usedBy }));
  const duplicateTargets = duplicateColumnUsage.flatMap((entry) => entry.usedBy);

  const invalidDerivedEquations: DerivedKey[] = [];
  const derivedDependencyIssues: Array<{ key: DerivedKey; missingDependencies: MappableTargetKey[] }> = [];

  for (const key of Object.keys(derivedConfig) as DerivedKey[]) {
    const entry = derivedConfig[key];
    if (entry.mode === 'calc') {
      const expr = validateExpression(entry.equation);
      if (!expr.ok) {
        invalidDerivedEquations.push(key);
      }

      const missingDependencies = getMissingDependencies(key, mappingByTarget, derivedConfig);
      if (missingDependencies.length > 0) {
        derivedDependencyIssues.push({ key, missingDependencies });
      }
    }

    if (entry.mode === 'map') {
      if (!entry.sheetColumnId || !hasHeader(headers, entry.sheetColumnId)) {
        invalidDerivedEquations.push(key);
      }
    }
  }
  const derivedHasCycle = hasDerivedCycle(derivedConfig);
  if (derivedHasCycle) {
    for (const key of Object.keys(derivedConfig) as DerivedKey[]) {
      if (derivedConfig[key].mode === 'calc' && !invalidDerivedEquations.includes(key)) {
        invalidDerivedEquations.push(key);
      }
    }
  }

  const hasErrors =
    missingRequiredTargets.length > 0 ||
    duplicateColumnUsage.length > 0 ||
    invalidDerivedEquations.length > 0 ||
    derivedDependencyIssues.length > 0;

  return {
    missingRequiredTargets,
    duplicateTargets,
    duplicateColumnUsage,
    invalidDerivedEquations,
    derivedDependencyIssues,
    mappedRequiredCount: REQUIRED_TARGET_KEYS.length - missingRequiredTargets.length,
    requiredCount: REQUIRED_TARGET_KEYS.length,
    status: hasErrors ? 'error' : 'ok',
    isValid: !hasErrors,
  };
};

export const autoFixDuplicateColumnUsage = (
  mappingByTarget: MappingByTarget,
  derivedConfig: DerivedConfig,
): { mappingByTarget: MappingByTarget; derivedConfig: DerivedConfig } => {
  const nextMapping: MappingByTarget = { ...mappingByTarget };
  const nextDerived: DerivedConfig = {
    day: { ...derivedConfig.day },
    totalSales: { ...derivedConfig.totalSales },
    creditPlusLottery: { ...derivedConfig.creditPlusLottery },
    cashDiff: { ...derivedConfig.cashDiff },
  };
  const used = new Set<string>();

  for (const key of MAPPABLE_TARGET_KEYS) {
    const columnId = nextMapping[key];
    if (!columnId) continue;
    if (used.has(columnId)) {
      nextMapping[key] = null;
      continue;
    }
    used.add(columnId);
  }

  for (const key of Object.keys(nextDerived) as DerivedKey[]) {
    const entry = nextDerived[key];
    if (entry.mode !== 'map' || !entry.sheetColumnId) continue;
    if (used.has(entry.sheetColumnId)) {
      nextDerived[key] = {
        ...entry,
        sheetColumnId: null,
      };
      continue;
    }
    used.add(entry.sheetColumnId);
  }

  return {
    mappingByTarget: nextMapping,
    derivedConfig: nextDerived,
  };
};
