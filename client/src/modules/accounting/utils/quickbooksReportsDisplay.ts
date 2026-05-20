import type { QuickBooksTaxChartAccount, QuickBooksTaxOverview, QuickBooksTaxReportRow } from '@retailsync/shared';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2
});

export type MoneyDisplay = {
  text: string;
  isMissing: boolean;
  isZero: boolean;
  isNegative: boolean;
  raw: number | null;
};

export const formatMoneyDisplay = (value: number | null | undefined): MoneyDisplay => {
  if (value == null || Number.isNaN(value)) {
    return { text: 'No value', isMissing: true, isZero: false, isNegative: false, raw: null };
  }
  if (value === 0) {
    return { text: currencyFormatter.format(0), isMissing: false, isZero: true, isNegative: false, raw: 0 };
  }
  return {
    text: currencyFormatter.format(value),
    isMissing: false,
    isZero: false,
    isNegative: value < 0,
    raw: value
  };
};

export const formatReportDateRange = (from: string, to: string) => {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${from} – ${to}`;
  }
  const fmt = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
};

export const basisLabel = (basis: 'cash' | 'accrual') => (basis === 'cash' ? 'Cash' : 'Accrual');

export const isTotalLikeRow = (label: string) => /total|net income|gross profit/i.test(label);

export const reportRowsHaveValues = (rows: QuickBooksTaxReportRow[]) =>
  rows.some((row) => row.amount != null && !Number.isNaN(row.amount));

export const reportRowsAllEmpty = (rows: QuickBooksTaxReportRow[]) =>
  rows.length > 0 && !reportRowsHaveValues(rows);

export type KpiCardModel = {
  label: string;
  money: MoneyDisplay;
  helper: string;
};

export const buildExecutiveKpis = (overview: QuickBooksTaxOverview | null): KpiCardModel[] => {
  const cards = overview?.cards;
  const netIncome = formatMoneyDisplay(cards?.netIncome);
  const totalAssets = formatMoneyDisplay(cards?.totalAssets);
  const totalLiabilities = formatMoneyDisplay(cards?.totalLiabilities);
  const totalEquity = formatMoneyDisplay(cards?.totalEquity);

  return [
    {
      label: 'Net Income',
      money: netIncome,
      helper: netIncome.isMissing
        ? 'Profit & Loss has no net income amount for this range.'
        : 'From Profit & Loss summary.'
    },
    {
      label: 'Total Assets',
      money: totalAssets,
      helper: totalAssets.isMissing ? 'No balance sheet asset total for this range.' : 'From Balance Sheet.'
    },
    {
      label: 'Total Liabilities',
      money: totalLiabilities,
      helper: totalLiabilities.isMissing
        ? 'No balance sheet liability total for this range.'
        : 'From Balance Sheet.'
    },
    {
      label: 'Total Equity',
      money: totalEquity,
      helper: totalEquity.isNegative
        ? 'Negative equity — review balance sheet.'
        : totalEquity.isMissing
          ? 'No equity total for this range.'
          : 'From Balance Sheet.'
    },
    {
      label: 'AR Open',
      money: formatMoneyDisplay(cards?.arOpen),
      helper: 'Open accounts receivable.'
    },
    {
      label: 'AP Open',
      money: formatMoneyDisplay(cards?.apOpen),
      helper: 'Open accounts payable.'
    }
  ];
};

export const normalizeAccountType = (accountType: string | null | undefined) => {
  const value = String(accountType ?? '').trim();
  if (!value) return 'Other';
  const lower = value.toLowerCase();
  if (lower.includes('bank')) return 'Bank';
  if (lower.includes('income') || lower.includes('revenue')) return 'Income';
  if (lower.includes('expense') || lower.includes('cost')) return 'Expense';
  if (lower.includes('liabil')) return 'Liability';
  if (lower.includes('asset')) return 'Asset';
  if (lower.includes('equity')) return 'Equity';
  return value;
};

export const summarizeAccountsByType = (accounts: QuickBooksTaxChartAccount[]) => {
  const counts = new Map<string, number>();
  for (const account of accounts) {
    const bucket = normalizeAccountType(account.accountType);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
};

export const filterAccounts = (
  accounts: QuickBooksTaxChartAccount[],
  search: string,
  typeFilter: string
) => {
  const query = search.trim().toLowerCase();
  return accounts.filter((account) => {
    const bucket = normalizeAccountType(account.accountType);
    if (typeFilter !== 'all' && bucket !== typeFilter) return false;
    if (!query) return true;
    const haystack = [account.name, account.code, account.accountType]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
};
