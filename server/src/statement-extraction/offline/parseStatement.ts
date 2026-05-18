import type {
  CheckRow,
  GroupedPdfLine,
  OfflineStatementExtractionValidation,
  StatementTransaction
} from './types';

export const SECTIONS = [
  'Deposits',
  'Electronic Credits',
  'Other Credits',
  'Electronic Debits',
  'Checks Cleared',
  'Daily Balances'
] as const;

const transactionRowRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(.+?)\s+\$?([\d,]+\.\d{2})$/;

const parseMoney = (value: string) => Number(String(value).replace(/[$,]/g, ''));

const normalizeDate = (value: string) => {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return value;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
};

const normalizeSectionKey = (section: string) =>
  section.toLowerCase().replace(/\s+/g, '_');

const splitJoinedTransactionLine = (line: string) => {
  const dateMatches = [...line.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g)];
  if (dateMatches.length <= 1) return [line];
  return dateMatches
    .map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < dateMatches.length ? (dateMatches[index + 1].index ?? line.length) : line.length;
      return line.slice(start, end).trim();
    })
    .filter(Boolean);
};

const mapTransactionType = (section: string): StatementTransaction['type'] => {
  if (section === 'Electronic Debits' || section === 'Checks Cleared') return section === 'Checks Cleared' ? 'check' : 'debit';
  if (section === 'Daily Balances') return 'balance';
  return 'credit';
};

export const parseStatementLines = (args: {
  lines: GroupedPdfLine[];
  checkRows?: CheckRow[];
}): {
  transactions: StatementTransaction[];
  checks: CheckRow[];
  validation: OfflineStatementExtractionValidation;
} => {
  const transactions: StatementTransaction[] = [];
  const checks = [...(args.checkRows ?? [])];
  let activeSection = '';
  let rowId = 0;

  for (const line of args.lines) {
    if (SECTIONS.includes(line.text as (typeof SECTIONS)[number])) {
      activeSection = line.text;
      continue;
    }

    if (!activeSection || activeSection === 'Checks Cleared' || activeSection === 'Daily Balances') {
      continue;
    }

    for (const segment of splitJoinedTransactionLine(line.text)) {
      const match = segment.match(transactionRowRegex);
      if (!match) continue;
      rowId += 1;
      transactions.push({
        id: `offline-txn-${String(rowId).padStart(4, '0')}`,
        section: normalizeSectionKey(activeSection),
        date: normalizeDate(match[1]),
        description: match[2].trim(),
        amount: parseMoney(match[3]),
        type: mapTransactionType(activeSection),
        page: line.page,
        rowText: segment,
        bbox: line.bbox
      });
    }
  }

  for (const row of checks) {
    rowId += 1;
    transactions.push({
      id: `offline-txn-${String(rowId).padStart(4, '0')}`,
      section: 'checks_cleared',
      date: row.date,
      description: `Check ${row.checkNumber}`,
      amount: row.amount,
      type: 'check',
      page: row.sourcePage,
      rowText: row.rowText,
      bbox: row.bbox
    });
  }

  const sectionCounts = transactions.reduce<Record<string, number>>((acc, transaction) => {
    acc[transaction.section] = Number(acc[transaction.section] ?? 0) + 1;
    return acc;
  }, {});
  const sectionTotals = transactions.reduce<Record<string, number>>((acc, transaction) => {
    acc[transaction.section] = Number((acc[transaction.section] ?? 0) + Number(transaction.amount ?? 0));
    return acc;
  }, {});

  return {
    transactions,
    checks,
    validation: {
      sectionCounts,
      sectionTotals,
      checkCount: checks.length,
      checkTotal: Number(checks.reduce((sum, row) => sum + Number(row.amount ?? 0), 0).toFixed(2)),
      warnings: []
    }
  };
};
