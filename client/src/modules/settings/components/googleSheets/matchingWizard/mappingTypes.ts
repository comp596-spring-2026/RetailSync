export const REQUIRED_TARGET_KEYS = [
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'cashExpenses',
] as const;

export const OPTIONAL_TARGET_KEYS = ['notes'] as const;

export const MAPPABLE_TARGET_KEYS = [...REQUIRED_TARGET_KEYS, ...OPTIONAL_TARGET_KEYS] as const;

export type RequiredTargetKey = (typeof REQUIRED_TARGET_KEYS)[number];
export type OptionalTargetKey = (typeof OPTIONAL_TARGET_KEYS)[number];
export type MappableTargetKey = (typeof MAPPABLE_TARGET_KEYS)[number];
export type TargetKey = MappableTargetKey;

export type DerivedKey = 'day' | 'totalSales' | 'creditPlusLottery' | 'cashDiff';
export type DerivedMode = 'calc' | 'map';

export type DerivedDefinition = {
  key: DerivedKey;
  label: string;
  formula: string;
  dependencies: MappableTargetKey[];
};

export type DerivedFieldConfig = {
  mode: DerivedMode;
  equation: string;
  sheetColumnId: string | null;
};

export type DerivedConfig = Record<DerivedKey, DerivedFieldConfig>;

export const DERIVED_DEFAULT_FORMULAS: Record<DerivedKey, string> = {
  day: 'weekday(date)',
  totalSales: 'highTax + lowTax',
  creditPlusLottery: 'creditCard + lotteryPayout',
  cashDiff: 'totalSales + gas + lottery + saleTax - (creditCard + lotteryPayout)',
};

export const TARGET_LABELS: Record<MappableTargetKey | DerivedKey, string> = {
  date: 'Date',
  highTax: 'High Tax',
  lowTax: 'Low Tax',
  saleTax: 'Sale Tax',
  gas: 'Gas',
  lottery: 'Lottery',
  creditCard: 'Credit Card',
  lotteryPayout: 'Lottery Payout (Cash)',
  cashExpenses: 'Cash Expenses',
  notes: 'Notes / Description',
  day: 'Day',
  totalSales: 'Total Sales',
  creditPlusLottery: 'Credit + Lottery',
  cashDiff: 'Cash Diff',
};

export const DERIVED_DEFINITIONS: DerivedDefinition[] = [
  {
    key: 'day',
    label: 'Day',
    formula: DERIVED_DEFAULT_FORMULAS.day,
    dependencies: ['date'],
  },
  {
    key: 'totalSales',
    label: 'Total Sales',
    formula: DERIVED_DEFAULT_FORMULAS.totalSales,
    dependencies: ['highTax', 'lowTax'],
  },
  {
    key: 'creditPlusLottery',
    label: 'Credit + Lottery',
    formula: DERIVED_DEFAULT_FORMULAS.creditPlusLottery,
    dependencies: ['creditCard', 'lotteryPayout'],
  },
  {
    key: 'cashDiff',
    label: 'Cash Diff',
    formula: DERIVED_DEFAULT_FORMULAS.cashDiff,
    dependencies: ['saleTax', 'gas', 'lottery', 'creditCard', 'lotteryPayout'],
  },
];

export type MappingByColumn = Record<string, string>;
export type MappingByTarget = Record<MappableTargetKey, string | null>;

export type DuplicateColumnUsage = {
  columnId: string;
  usedBy: string[];
};

export type DerivedDependencyIssue = {
  key: DerivedKey;
  missingDependencies: MappableTargetKey[];
};

export type MappingCompatibility = {
  missingRequiredTargets: RequiredTargetKey[];
  duplicateTargets: string[];
  duplicateColumnUsage: DuplicateColumnUsage[];
  invalidDerivedEquations: DerivedKey[];
  derivedDependencyIssues: DerivedDependencyIssue[];
  mappedRequiredCount: number;
  requiredCount: number;
  status: 'ok' | 'warn' | 'error';
  isValid: boolean;
};
