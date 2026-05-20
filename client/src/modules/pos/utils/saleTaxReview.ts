import type { PosDailyRecord } from '../api';

export const GEORGIA_STATE_TAX_RATE = 0.04;
export const TROUP_COUNTY_LOCAL_TAX_RATE = 0.03;
export const HIGH_TAX_RATE = GEORGIA_STATE_TAX_RATE + TROUP_COUNTY_LOCAL_TAX_RATE;
export const LOW_TAX_RATE = TROUP_COUNTY_LOCAL_TAX_RATE;
export const TAX_DIFFERENCE_REVIEW_THRESHOLD = 1;

export type SalesTaxReviewStatus = 'ready' | 'needs_review' | 'missing_data';
export type ValidationLevel = 'pass' | 'warning' | 'fail';

export type VendorCompensationBreakdown = {
  firstBracketBase: number;
  firstBracketCompensation: number;
  overBracketBase: number;
  overBracketCompensation: number;
  total: number;
};

export type SalesTaxValidationCheck = {
  key: string;
  level: ValidationLevel;
  label: string;
};

export type SalesTaxMonthlyReview = {
  monthKey: string;
  year: number;
  monthIndex: number;
  monthLabel: string;
  subtitle: string;
  status: SalesTaxReviewStatus;
  rows: PosDailyRecord[];
  posDaysIncluded: number;
  uniqueDayCount: number;
  totalSales: number;
  taxableSales: number;
  localTaxBase: number;
  exemptReferenceSales: number;
  grocerySales: number;
  foodSales: number;
  gasolineSales: number;
  lotterySales: number;
  moneyOrderSales: number;
  moFeeSales: number;
  phoneCardSales: number;
  ebtSales: number;
  georgiaStateTaxBase: number;
  georgiaStateTaxDue: number;
  troupCountyTaxBase: number;
  troupCountyTaxDue: number;
  highTaxSales: number;
  lowTaxSales: number;
  highTaxCalculated: number;
  lowTaxCalculated: number;
  calculatedSalesTax: number;
  posSalesTaxCollected: number;
  manualAdjustment: number;
  totalTaxCollected: number;
  saleTaxCollected: number;
  difference: number;
  vendorCompensation: VendorCompensationBreakdown;
  amountPayableSalesTax: number;
  gasSales: number;
  lotterySold: number;
  creditCard: number;
  lotteryPayoutCash: number;
  cashExpenses: number;
  notesCount: number;
  validationChecks: SalesTaxValidationCheck[];
  needsReviewReasons: string[];
};

export type SalesTaxReviewIndex = {
  availableYears: number[];
  monthlyReviews: SalesTaxMonthlyReview[];
  monthlyReviewsByYear: Record<number, SalesTaxMonthlyReview[]>;
  latestYear: number | null;
};

type SalesTaxMonthlyReviewBase = Omit<
  SalesTaxMonthlyReview,
  'status' | 'validationChecks' | 'needsReviewReasons'
>;

const MANUAL_ADJUSTMENT_PATTERNS = [
  /manual adjustment[^0-9-+]*([$]?\s*-?\d[\d,]*\.?\d{0,2})/gi,
  /tax adjustment[^0-9-+]*([$]?\s*-?\d[\d,]*\.?\d{0,2})/gi,
  /\badjustment\b[^0-9-+]*([$]?\s*-?\d[\d,]*\.?\d{0,2})/gi
];

const roundCurrency = (value: number) => Number(value.toFixed(2));

const monthFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
});

const normalizeDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const isFiniteNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

const parseAdjustmentAmount = (value: string) => {
  const cleaned = value.replace(/[$,\s]/g, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const extractManualAdjustmentFromNotes = (notes: string) => {
  let total = 0;

  for (const pattern of MANUAL_ADJUSTMENT_PATTERNS) {
    const matches = notes.matchAll(pattern);
    for (const match of matches) {
      total += parseAdjustmentAmount(match[1] ?? '');
    }
  }

  return roundCurrency(total);
};

const monthKeyFromRow = (row: PosDailyRecord) => {
  const date = normalizeDate(String(row.date ?? ''));
  if (!date) return null;
  return date.slice(0, 7);
};

const parseYearMonth = (monthKey: string) => {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;
  return {
    year: Number(match[1]),
    monthIndex: Number(match[2]) - 1
  };
};

const getDaysInMonthUtc = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const currentUtcYearMonth = () => {
  const now = new Date();
  return {
    year: now.getUTCFullYear(),
    monthIndex: now.getUTCMonth()
  };
};

export const calculateGeorgiaVendorCompensation = (saleTaxCollected: number): VendorCompensationBreakdown => {
  const normalizedTax = Math.max(0, Number(saleTaxCollected ?? 0));
  const firstBracketBase = Math.min(normalizedTax, 3000);
  const overBracketBase = Math.max(normalizedTax - 3000, 0);

  return {
    firstBracketBase: roundCurrency(firstBracketBase),
    firstBracketCompensation: roundCurrency(firstBracketBase * 0.03),
    overBracketBase: roundCurrency(overBracketBase),
    overBracketCompensation: roundCurrency(overBracketBase * 0.005),
    total: roundCurrency(firstBracketBase * 0.03 + overBracketBase * 0.005)
  };
};

const buildValidationChecks = (review: SalesTaxMonthlyReviewBase) => {
  const checks: SalesTaxValidationCheck[] = [];
  const reasons: string[] = [];
  const taxableSales = review.highTaxSales + review.lowTaxSales;
  const invalidRequiredValues = review.rows.some((row) => {
    const normalizedDate = normalizeDate(String(row.date ?? ''));
    return (
      !normalizedDate ||
      !isFiniteNumber(row.highTax) ||
      !isFiniteNumber(row.lowTax) ||
      !isFiniteNumber(row.saleTax)
    );
  });

  checks.push({
    key: 'required-fields',
    level: invalidRequiredValues ? 'fail' : 'pass',
    label: invalidRequiredValues ? 'Required fields are incomplete or invalid' : 'Required fields exist'
  });
  if (invalidRequiredValues) reasons.push('Required fields are incomplete or invalid.');

  const hasRows = review.rows.length > 0;
  checks.push({
    key: 'month-has-data',
    level: hasRows ? 'pass' : 'fail',
    label: hasRows ? 'Month has POS data' : 'Month has no POS data'
  });
  if (!hasRows) reasons.push('Month has no POS data.');

  const taxDifference = Math.abs(review.difference);
  const collectedTaxClose = taxDifference <= TAX_DIFFERENCE_REVIEW_THRESHOLD;
  let taxDifferenceLevel: ValidationLevel = 'pass';
  let taxDifferenceLabel = 'Sale tax collected is close to calculated tax';

  if (review.saleTaxCollected === 0 && taxableSales > 0) {
    taxDifferenceLevel = 'warning';
    taxDifferenceLabel = 'Sale tax collected is zero while taxable sales exist';
    reasons.push('Sale tax collected is zero while taxable sales exist.');
  } else if (review.calculatedSalesTax === 0 && taxableSales > 0) {
    taxDifferenceLevel = 'warning';
    taxDifferenceLabel = 'Calculated sales tax is zero while taxable sales exist';
    reasons.push('Calculated sales tax is zero while taxable sales exist.');
  } else if (!collectedTaxClose) {
    taxDifferenceLevel = 'warning';
    taxDifferenceLabel = `Sale tax collected differs from calculated tax by $${taxDifference.toFixed(2)}`;
    reasons.push(`Collected tax differs from calculated tax by $${taxDifference.toFixed(2)}.`);
  }

  checks.push({
    key: 'tax-difference',
    level: taxDifferenceLevel,
    label: taxDifferenceLabel
  });

  const vendorCompensationUnusual =
    review.vendorCompensation.total > review.saleTaxCollected ||
    (review.saleTaxCollected > 0 && review.vendorCompensation.total <= 0);
  checks.push({
    key: 'vendor-compensation',
    level: vendorCompensationUnusual ? 'warning' : 'pass',
    label: vendorCompensationUnusual
      ? 'Vendor compensation appears unusual'
      : 'Vendor compensation uses Georgia bracket rule'
  });
  if (vendorCompensationUnusual) reasons.push('Vendor compensation appears unusual.');

  if (review.notesCount > 0) {
    checks.push({
      key: 'notes',
      level: 'warning',
      label: `Notes exist on ${review.notesCount} daily record${review.notesCount === 1 ? '' : 's'}`
    });
    reasons.push(`Notes exist on ${review.notesCount} daily record${review.notesCount === 1 ? '' : 's'}.`);
  } else {
    checks.push({
      key: 'notes',
      level: 'pass',
      label: 'No daily notes require review attention'
    });
  }

  const { year, monthIndex } = review;
  const daysInMonth = getDaysInMonthUtc(year, monthIndex);
  const currentMonth = currentUtcYearMonth();
  const isCurrentMonth = currentMonth.year === year && currentMonth.monthIndex === monthIndex;
  const likelyPartialMonth = !isCurrentMonth && review.uniqueDayCount < daysInMonth;

  checks.push({
    key: 'coverage',
    level: likelyPartialMonth ? 'warning' : 'pass',
    label: likelyPartialMonth
      ? `Month may be partial or inconsistent (${review.uniqueDayCount}/${daysInMonth} POS days present)`
      : 'Month coverage looks complete for review'
  });
  if (likelyPartialMonth) {
    reasons.push(`Month may be partial or inconsistent (${review.uniqueDayCount}/${daysInMonth} POS days present).`);
  }

  return { checks, reasons, invalidRequiredValues };
};

const statusFromChecks = (
  review: SalesTaxMonthlyReviewBase,
  invalidRequiredValues: boolean,
  reasons: string[]
): SalesTaxReviewStatus => {
  if (!review.rows.length || invalidRequiredValues) return 'missing_data';
  if (reasons.length > 0) return 'needs_review';
  if (review.saleTaxCollected <= 0) return 'missing_data';
  return 'ready';
};

export const buildSalesTaxReviewIndex = (rows: PosDailyRecord[]): SalesTaxReviewIndex => {
  const grouped = new Map<string, PosDailyRecord[]>();

  for (const row of rows) {
    const monthKey = monthKeyFromRow(row);
    if (!monthKey) continue;
    const current = grouped.get(monthKey) ?? [];
    current.push(row);
    grouped.set(monthKey, current);
  }

  const monthlyReviews = Array.from(grouped.entries())
    .map(([monthKey, monthRows]) => {
      const parsed = parseYearMonth(monthKey);
      if (!parsed) return null;

      const highTaxSales = roundCurrency(
        monthRows.reduce((sum, row) => sum + Number(row.highTax ?? 0), 0)
      );
      const lowTaxSales = roundCurrency(
        monthRows.reduce((sum, row) => sum + Number(row.lowTax ?? 0), 0)
      );
      const posSalesTaxCollected = roundCurrency(
        monthRows.reduce((sum, row) => sum + Number(row.saleTax ?? 0), 0)
      );
      const manualAdjustment = roundCurrency(
        monthRows.reduce((sum, row) => sum + extractManualAdjustmentFromNotes(String(row.notes ?? '')), 0)
      );
      const totalTaxCollected = roundCurrency(posSalesTaxCollected + manualAdjustment);
      const saleTaxCollected = totalTaxCollected;
      const highTaxCalculated = roundCurrency(highTaxSales * HIGH_TAX_RATE);
      const lowTaxCalculated = roundCurrency(lowTaxSales * LOW_TAX_RATE);
      const georgiaStateTaxBase = highTaxSales;
      const georgiaStateTaxDue = roundCurrency(highTaxSales * GEORGIA_STATE_TAX_RATE);
      const troupCountyTaxBase = roundCurrency(highTaxSales + lowTaxSales);
      const troupCountyTaxDue = roundCurrency(troupCountyTaxBase * TROUP_COUNTY_LOCAL_TAX_RATE);
      const calculatedSalesTax = roundCurrency(highTaxCalculated + lowTaxCalculated);
      const difference = roundCurrency(totalTaxCollected - calculatedSalesTax);
      const vendorCompensation = calculateGeorgiaVendorCompensation(totalTaxCollected);
      const amountPayableSalesTax = roundCurrency(totalTaxCollected - vendorCompensation.total);
      const gasSales = roundCurrency(monthRows.reduce((sum, row) => sum + Number(row.gas ?? 0), 0));
      const lotterySold = roundCurrency(monthRows.reduce((sum, row) => sum + Number(row.lottery ?? 0), 0));
      const totalSales = roundCurrency(highTaxSales + lowTaxSales + gasSales + lotterySold);
      const taxableSales = highTaxSales;
      const localTaxBase = roundCurrency(highTaxSales + lowTaxSales);
      const exemptReferenceSales = roundCurrency(totalSales - taxableSales);
      const dateKeys = new Set(
        monthRows
          .map((row) => normalizeDate(String(row.date ?? '')))
          .filter((value): value is string => Boolean(value))
      );

      const reviewBase = {
        monthKey,
        year: parsed.year,
        monthIndex: parsed.monthIndex,
        monthLabel: monthFormatter.format(new Date(Date.UTC(parsed.year, parsed.monthIndex, 1))),
        subtitle: `${monthFormatter.format(new Date(Date.UTC(parsed.year, parsed.monthIndex, 1)))} — Troup County, GA`,
        rows: [...monthRows].sort((a, b) => String(a.date).localeCompare(String(b.date))),
        posDaysIncluded: monthRows.length,
        uniqueDayCount: dateKeys.size,
        totalSales,
        taxableSales,
        localTaxBase,
        exemptReferenceSales,
        grocerySales: highTaxSales,
        foodSales: lowTaxSales,
        gasolineSales: gasSales,
        lotterySales: lotterySold,
        moneyOrderSales: 0,
        moFeeSales: 0,
        phoneCardSales: 0,
        ebtSales: 0,
        georgiaStateTaxBase,
        georgiaStateTaxDue,
        troupCountyTaxBase,
        troupCountyTaxDue,
        highTaxSales,
        lowTaxSales,
        highTaxCalculated,
        lowTaxCalculated,
        calculatedSalesTax,
        posSalesTaxCollected,
        manualAdjustment,
        totalTaxCollected,
        saleTaxCollected,
        difference,
        vendorCompensation,
        amountPayableSalesTax,
        gasSales,
        lotterySold,
        creditCard: roundCurrency(monthRows.reduce((sum, row) => sum + Number(row.creditCard ?? 0), 0)),
        lotteryPayoutCash: roundCurrency(
          monthRows.reduce((sum, row) => sum + Number(row.lotteryPayout ?? 0), 0)
        ),
        cashExpenses: roundCurrency(
          monthRows.reduce((sum, row) => sum + Number(row.cashExpenses ?? 0), 0)
        ),
        notesCount: monthRows.filter((row) => String(row.notes ?? '').trim().length > 0).length
      };

      const { checks, reasons, invalidRequiredValues } = buildValidationChecks(reviewBase);

      return {
        ...reviewBase,
        validationChecks: checks,
        needsReviewReasons: reasons,
        status: statusFromChecks(reviewBase, invalidRequiredValues, reasons)
      } as SalesTaxMonthlyReview;
    })
    .filter((review): review is SalesTaxMonthlyReview => Boolean(review))
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const availableYears = Array.from(new Set(monthlyReviews.map((review) => review.year))).sort((a, b) => a - b);
  const monthlyReviewsByYear = availableYears.reduce<Record<number, SalesTaxMonthlyReview[]>>((acc, year) => {
    acc[year] = monthlyReviews.filter((review) => review.year === year);
    return acc;
  }, {});

  return {
    availableYears,
    monthlyReviews,
    monthlyReviewsByYear,
    latestYear: availableYears.length > 0 ? availableYears[availableYears.length - 1] : null
  };
};
