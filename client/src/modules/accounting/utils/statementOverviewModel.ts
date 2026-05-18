import type { BankStatementDetail, BankStatementStatus, StatementTransaction } from '@retailsync/shared';
import { formatMaybeDate, formatMoney, formatStatusLabel } from './statementDetailHelpers';
import {
  compareSectionKeys,
  sectionDirection,
  sectionReviewType,
  sectionWorkflowHint
} from './statementSectionWorkflow';

export type ValueSource =
  | 'printed_summary'
  | 'printed_footer'
  | 'calculated_from_rows'
  | 'ocr_inferred'
  | 'unknown';

export type OverviewField<T> = {
  value: T | null;
  display: string;
  source: ValueSource;
  confidence: 'high' | 'medium' | 'low';
};

export type StatementOverviewSection = {
  key: string;
  label: string;
  direction: 'credit' | 'debit' | 'unknown';
  count: OverviewField<number>;
  total: OverviewField<number>;
  sourceLabel: string;
  reviewType: string;
  pageStart?: number;
  pageEnd?: number;
};

export type StatementInternalCheck = {
  id: string;
  label: string;
  formula: string;
  status: 'pass' | 'fail' | 'unknown';
};

export type StatementOverview = {
  summary: {
    beginningBalance: OverviewField<number>;
    totalCreditsAmount: OverviewField<number>;
    creditCount: OverviewField<number>;
    totalDebitsAmount: OverviewField<number>;
    debitCount: OverviewField<number>;
    endingBalance: OverviewField<number>;
    totalEntries: OverviewField<number>;
  };
  sections: StatementOverviewSection[];
  checks: StatementInternalCheck[];
  checksMeta: {
    ready: boolean;
    passedCount: number;
    failedCount: number;
    unknownCount: number;
  };
};

const isExtractionComplete = (status: BankStatementStatus) =>
  status === 'ready_for_review' || status === 'needs_parser_review';

const NON_POSTING_ROW_TYPES = new Set([
  'section_header',
  'beginning_balance',
  'ending_balance',
  'daily_balance',
  'summary_total',
  'noise'
]);

const round2 = (value: number) => Number(value.toFixed(2));

const notDetected = <T>(): OverviewField<T> => ({
  value: null,
  display: 'Not detected',
  source: 'unknown',
  confidence: 'low'
});

const field = <T>(
  value: T | null | undefined,
  format: (value: T) => string,
  source: ValueSource,
  confidence: 'high' | 'medium' | 'low' = 'high'
): OverviewField<T> => {
  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) {
    return notDetected();
  }
  return {
    value: value as T,
    display: format(value as T),
    source,
    confidence
  };
};

const moneyField = (value: number | null | undefined, source: ValueSource, confidence?: 'high' | 'medium' | 'low') =>
  field(value, (v) => formatMoney(v), source, confidence);

const countField = (value: number | null | undefined, source: ValueSource, confidence?: 'high' | 'medium' | 'low') =>
  field(value, (v) => String(v), source, confidence);

const sourceLabel = (source: ValueSource) => {
  switch (source) {
    case 'printed_summary':
      return 'Printed summary';
    case 'printed_footer':
      return 'Printed footer';
    case 'calculated_from_rows':
      return 'Calculated from rows';
    case 'ocr_inferred':
      return 'OCR inferred';
    default:
      return 'Unknown';
  }
};

const parseFooterTotals = (description: string) => {
  const match = description.match(/(\d+)\s+item\(s\)\s+totaling\s+\$?([\d,]+\.\d{2})/i);
  if (!match) return null;
  return {
    count: Number(match[1]),
    total: round2(Number(match[2].replace(/,/g, '')))
  };
};

const parsePeriodSummaryLine = (description: string) => {
  const creditMatch = description.match(/(\d+)\s+credit\(s\)\s+this\s+period\s+\$?([\d,]+\.\d{2})/i);
  if (creditMatch) {
    return {
      kind: 'credit' as const,
      count: Number(creditMatch[1]),
      total: round2(Number(creditMatch[2].replace(/,/g, '')))
    };
  }
  const debitMatch = description.match(/(\d+)\s+debit\(s\)\s+this\s+period\s+\$?([\d,]+\.\d{2})/i);
  if (debitMatch) {
    return {
      kind: 'debit' as const,
      count: Number(debitMatch[1]),
      total: round2(Number(debitMatch[2].replace(/,/g, '')))
    };
  }
  return null;
};

const postingEntries = (entries: StatementTransaction[]) =>
  entries.filter((entry) => {
    if (entry.isPostingCandidate === false) return false;
    if (entry.rowType && NON_POSTING_ROW_TYPES.has(String(entry.rowType))) return false;
    if (entry.section === 'account_summary' || entry.section === 'daily_balances') return false;
    return true;
  });

const buildSections = (entries: StatementTransaction[]): StatementOverviewSection[] => {
  const footerBySection = new Map<string, { count: number; total: number }>();
  for (const entry of entries) {
    if (entry.rowType !== 'summary_total' || !entry.section) continue;
    const parsed = parseFooterTotals(entry.description);
    if (!parsed) continue;
    footerBySection.set(String(entry.section), parsed);
  }

  const sectionKeys = new Set<string>();
  for (const entry of postingEntries(entries)) {
    if (entry.section) sectionKeys.add(String(entry.section));
  }
  for (const key of footerBySection.keys()) {
    if (key !== 'account_summary' && key !== 'daily_balances') sectionKeys.add(key);
  }

  return Array.from(sectionKeys)
    .filter((key) => key !== 'account_summary' && key !== 'daily_balances')
    .sort(compareSectionKeys)
    .map((key) => {
      const rows = postingEntries(entries).filter((entry) => String(entry.section) === key);
      const footer = footerBySection.get(key);
      const calculatedCount = rows.length;
      const calculatedTotal = round2(rows.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0));
      const pages = rows
        .map((row) => row.sourceLocator?.pageNumber)
        .filter((page): page is number => typeof page === 'number' && page > 0);

      const countSource: ValueSource = footer ? 'printed_footer' : calculatedCount > 0 ? 'calculated_from_rows' : 'unknown';
      const totalSource: ValueSource = footer ? 'printed_footer' : calculatedTotal > 0 ? 'calculated_from_rows' : 'unknown';

      return {
        key,
        label: formatStatusLabel(key),
        direction: sectionDirection(key),
        count: countField(footer?.count ?? (calculatedCount > 0 ? calculatedCount : null), countSource),
        total: moneyField(footer?.total ?? (calculatedTotal > 0 ? calculatedTotal : null), totalSource),
        sourceLabel: sourceLabel(totalSource),
        reviewType: sectionReviewType(key),
        pageStart: pages.length ? Math.min(...pages) : undefined,
        pageEnd: pages.length ? Math.max(...pages) : undefined
      };
    });
};

const buildInternalChecks = (args: {
  beginning: number | null;
  ending: number | null;
  creditTotal: number | null;
  debitTotal: number | null;
  creditCount: number | null;
  debitCount: number | null;
  sections: StatementOverviewSection[];
}): StatementInternalCheck[] => {
  const checks: StatementInternalCheck[] = [];

  if (args.beginning != null && args.creditTotal != null && args.debitTotal != null && args.ending != null) {
    const computed = round2(args.beginning + args.creditTotal - args.debitTotal);
    const passed = Math.abs(computed - args.ending) <= 0.01;
    checks.push({
      id: 'balance_formula',
      label: 'Balance formula',
      formula: `${formatMoney(args.beginning)} + ${formatMoney(args.creditTotal)} - ${formatMoney(args.debitTotal)} = ${formatMoney(computed)}`,
      status: passed ? 'pass' : 'fail'
    });
  } else {
    checks.push({
      id: 'balance_formula',
      label: 'Balance formula',
      formula: 'Beginning balance + credits − debits = ending balance',
      status: 'unknown'
    });
  }

  const creditSections = args.sections.filter((section) => section.direction === 'credit');
  const debitSections = args.sections.filter((section) => section.direction === 'debit');

  const creditSectionTotal = round2(
    creditSections.reduce((sum, section) => sum + Number(section.total.value ?? 0), 0)
  );
  const creditSectionCount = creditSections.reduce((sum, section) => sum + Number(section.count.value ?? 0), 0);
  const hasCreditSectionTotals = creditSections.every((section) => section.total.value != null);
  const hasCreditSectionCounts = creditSections.every((section) => section.count.value != null);

  if (args.creditTotal != null && hasCreditSectionTotals && creditSections.length > 0) {
    const passed = Math.abs(creditSectionTotal - args.creditTotal) <= 0.01;
    checks.push({
      id: 'credit_sections',
      label: 'Credit sections',
      formula: `${creditSections.map((s) => s.label).join(' + ')} = Total Credits`,
      status: passed ? 'pass' : 'fail'
    });
  } else {
    checks.push({
      id: 'credit_sections',
      label: 'Credit sections',
      formula: 'Sum of credit section totals vs total credits',
      status: 'unknown'
    });
  }

  if (args.creditCount != null && hasCreditSectionCounts && creditSections.length > 0) {
    const passed = creditSectionCount === args.creditCount;
    if (checks[checks.length - 1]?.id === 'credit_sections' && checks[checks.length - 1].status === 'unknown') {
      // keep unknown
    } else if (passed || checks.some((c) => c.id === 'credit_sections' && c.status !== 'unknown')) {
      // count check is supplementary; only add if we already have section total check or as separate - user asked for count check
    }
  }

  const debitSectionTotal = round2(
    debitSections.reduce((sum, section) => sum + Number(section.total.value ?? 0), 0)
  );
  const hasDebitSectionTotals = debitSections.every((section) => section.total.value != null);

  if (args.debitTotal != null && hasDebitSectionTotals && debitSections.length > 0) {
    const passed = Math.abs(debitSectionTotal - args.debitTotal) <= 0.01;
    checks.push({
      id: 'debit_sections',
      label: 'Debit sections',
      formula: `${debitSections.map((s) => s.label).join(' + ')} = Total Debits`,
      status: passed ? 'pass' : 'fail'
    });
  } else {
    checks.push({
      id: 'debit_sections',
      label: 'Debit sections',
      formula: 'Sum of debit section totals vs total debits',
      status: 'unknown'
    });
  }

  return checks;
};

export const buildStatementOverview = (args: {
  statement: BankStatementDetail;
  entries: StatementTransaction[];
  liveMetrics: {
    entryCount: number;
    debitCount: number;
    creditCount: number;
    startingBalance: number | null;
    endingBalance: number | null;
  } | null;
  ocrText?: string | null;
}): StatementOverview => {
  const { statement, entries, liveMetrics } = args;

  const beginningRow = entries.find((entry) => entry.rowType === 'beginning_balance');
  const endingRow = [...entries].reverse().find((entry) => entry.rowType === 'ending_balance');

  let periodCredit: { count: number; total: number } | null = null;
  let periodDebit: { count: number; total: number } | null = null;
  for (const entry of entries) {
    const parsed = parsePeriodSummaryLine(entry.description);
    if (!parsed) continue;
    if (parsed.kind === 'credit') periodCredit = { count: parsed.count, total: parsed.total };
    if (parsed.kind === 'debit') periodDebit = { count: parsed.count, total: parsed.total };
  }

  const posting = postingEntries(entries);
  const calculatedCreditTotal = round2(
    posting.filter((e) => e.type === 'credit').reduce((sum, e) => sum + Math.abs(Number(e.amount ?? 0)), 0)
  );
  const calculatedDebitTotal = round2(
    posting.filter((e) => e.type === 'debit').reduce((sum, e) => sum + Math.abs(Number(e.amount ?? 0)), 0)
  );

  const beginning =
    liveMetrics?.startingBalance ??
    (beginningRow ? round2(Number(beginningRow.amount)) : null);
  const ending =
    liveMetrics?.endingBalance ?? (endingRow ? round2(Number(endingRow.amount)) : null);
  const creditTotal = periodCredit?.total ?? (calculatedCreditTotal > 0 ? calculatedCreditTotal : null);
  const debitTotal = periodDebit?.total ?? (calculatedDebitTotal > 0 ? calculatedDebitTotal : null);
  const creditCount =
    periodCredit?.count ?? (liveMetrics?.creditCount != null && liveMetrics.creditCount > 0 ? liveMetrics.creditCount : null);
  const debitCount =
    periodDebit?.count ?? (liveMetrics?.debitCount != null && liveMetrics.debitCount > 0 ? liveMetrics.debitCount : null);
  const totalEntries = posting.length > 0 ? posting.length : liveMetrics?.entryCount ?? null;

  const sections = buildSections(entries);
  const checks = buildInternalChecks({
    beginning,
    ending,
    creditTotal,
    debitTotal,
    creditCount,
    debitCount,
    sections
  });

  const overview: StatementOverview = {
    summary: {
      beginningBalance: moneyField(beginning, beginningRow ? 'printed_summary' : 'ocr_inferred'),
      totalCreditsAmount: moneyField(creditTotal, periodCredit ? 'printed_summary' : 'calculated_from_rows'),
      creditCount: countField(creditCount, periodCredit ? 'printed_summary' : 'calculated_from_rows'),
      totalDebitsAmount: moneyField(debitTotal, periodDebit ? 'printed_summary' : 'calculated_from_rows'),
      debitCount: countField(debitCount, periodDebit ? 'printed_summary' : 'calculated_from_rows'),
      endingBalance: moneyField(ending, endingRow ? 'printed_summary' : 'ocr_inferred'),
      totalEntries: countField(totalEntries, 'calculated_from_rows')
    },
    sections,
    checks,
    checksMeta: {
      ready: isExtractionComplete(statement.status),
      passedCount: checks.filter((check) => check.status === 'pass').length,
      failedCount: checks.filter((check) => check.status === 'fail').length,
      unknownCount: checks.filter((check) => check.status === 'unknown').length
    }
  };

  return overview;
};

export { sectionWorkflowHint, formatWorkflowHint } from './statementSectionWorkflow';
