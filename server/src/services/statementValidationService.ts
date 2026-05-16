type ParsedStatementRow = {
  localId?: string;
  postDate: string;
  amount: number;
  type: 'debit' | 'credit';
  rowType:
    | 'beginning_balance'
    | 'ending_balance'
    | 'daily_balance'
    | 'summary_total'
    | 'deposit'
    | 'electronic_credit'
    | 'other_credit'
    | 'electronic_debit'
    | 'check_cleared'
    | 'noise';
  section:
    | 'account_summary'
    | 'deposits'
    | 'electronic_credits'
    | 'other_credits'
    | 'electronic_debits'
    | 'checks_cleared'
    | 'daily_balances'
    | 'unknown';
  description: string;
  checkNumber?: string;
  isPostingCandidate: boolean;
  sourceLocator: {
    pageNumber?: number;
    sourceText?: string;
  };
};

export type ValidationMismatch = {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  expected: string | number | null;
  actual: string | number | null;
};

export type ValidationReport = {
  statementId: string;
  passed: boolean;
  expected: {
    beginningBalance: number;
    endingBalance: number;
    depositsCount: number;
    depositsTotal: number;
    electronicCreditsCount: number;
    electronicCreditsTotal: number;
    otherCreditsCount: number;
    otherCreditsTotal: number;
    electronicDebitsCount: number;
    electronicDebitsTotal: number;
    checksCount: number;
    checksTotal: number;
    dailyBalancesCount: number;
  };
  actual: {
    beginningBalance: number | null;
    endingBalance: number | null;
    depositsCount: number;
    depositsTotal: number;
    electronicCreditsCount: number;
    electronicCreditsTotal: number;
    otherCreditsCount: number;
    otherCreditsTotal: number;
    electronicDebitsCount: number;
    electronicDebitsTotal: number;
    checksCount: number;
    checksTotal: number;
    dailyBalancesCount: number;
    postingCandidatesCount: number;
    excludedRowsCount: number;
  };
  mismatches: ValidationMismatch[];
};

export const southStateExpectedTruth = {
  beginningBalance: 15062.62,
  endingBalance: 19830.01,
  depositsCount: 9,
  depositsTotal: 36600.0,
  electronicCreditsCount: 5,
  electronicCreditsTotal: 5305.39,
  otherCreditsCount: 19,
  otherCreditsTotal: 45143.95,
  electronicDebitsCount: 38,
  electronicDebitsTotal: 49537.95,
  checksCount: 44,
  checksTotal: 32744.0,
  dailyBalancesCount: 22
} as const;

const round2 = (value: number) => Number(value.toFixed(2));

const sumBy = (rows: ParsedStatementRow[], predicate: (row: ParsedStatementRow) => boolean) =>
  round2(rows.filter(predicate).reduce((sum, row) => sum + Number(row.amount ?? 0), 0));

const countBy = (rows: ParsedStatementRow[], predicate: (row: ParsedStatementRow) => boolean) =>
  rows.filter(predicate).length;

export const buildStatementValidationReport = (args: {
  statementId: string;
  rows: ParsedStatementRow[];
}): ValidationReport => {
  const rows = args.rows;
  const beginning = rows.find((row) => row.rowType === 'beginning_balance');
  const ending = [...rows].reverse().find((row) => row.rowType === 'ending_balance');

  const actual = {
    beginningBalance: beginning ? round2(Number(beginning.amount)) : null,
    endingBalance: ending ? round2(Number(ending.amount)) : null,
    depositsCount: countBy(rows, (row) => row.rowType === 'deposit'),
    depositsTotal: sumBy(rows, (row) => row.rowType === 'deposit'),
    electronicCreditsCount: countBy(rows, (row) => row.rowType === 'electronic_credit'),
    electronicCreditsTotal: sumBy(rows, (row) => row.rowType === 'electronic_credit'),
    otherCreditsCount: countBy(rows, (row) => row.rowType === 'other_credit'),
    otherCreditsTotal: sumBy(rows, (row) => row.rowType === 'other_credit'),
    electronicDebitsCount: countBy(rows, (row) => row.rowType === 'electronic_debit'),
    electronicDebitsTotal: sumBy(rows, (row) => row.rowType === 'electronic_debit'),
    checksCount: countBy(rows, (row) => row.rowType === 'check_cleared'),
    checksTotal: sumBy(rows, (row) => row.rowType === 'check_cleared'),
    dailyBalancesCount: countBy(rows, (row) => row.rowType === 'daily_balance'),
    postingCandidatesCount: countBy(rows, (row) => row.isPostingCandidate),
    excludedRowsCount: countBy(rows, (row) => !row.isPostingCandidate)
  };

  const expected = southStateExpectedTruth;
  const mismatches: ValidationMismatch[] = [];
  const pushMismatch = (
    code: string,
    expectedValue: number | null,
    actualValue: number | null,
    message: string,
    tolerance = 0
  ) => {
    const diff = Math.abs(Number(actualValue ?? 0) - Number(expectedValue ?? 0));
    if (actualValue == null || expectedValue == null || diff > tolerance) {
      mismatches.push({
        code,
        severity: 'error',
        message,
        expected: expectedValue,
        actual: actualValue
      });
    }
  };

  pushMismatch('beginning_balance_mismatch', expected.beginningBalance, actual.beginningBalance, 'Beginning balance mismatch', 0.01);
  pushMismatch('ending_balance_mismatch', expected.endingBalance, actual.endingBalance, 'Ending balance mismatch', 0.01);
  pushMismatch('deposits_count_mismatch', expected.depositsCount, actual.depositsCount, 'Deposits item count mismatch');
  pushMismatch('deposits_total_mismatch', expected.depositsTotal, actual.depositsTotal, 'Deposits total mismatch', 0.01);
  pushMismatch(
    'electronic_credits_count_mismatch',
    expected.electronicCreditsCount,
    actual.electronicCreditsCount,
    'Electronic credits item count mismatch'
  );
  pushMismatch(
    'electronic_credits_total_mismatch',
    expected.electronicCreditsTotal,
    actual.electronicCreditsTotal,
    'Electronic credits total mismatch',
    0.01
  );
  pushMismatch('other_credits_count_mismatch', expected.otherCreditsCount, actual.otherCreditsCount, 'Other credits item count mismatch');
  pushMismatch('other_credits_total_mismatch', expected.otherCreditsTotal, actual.otherCreditsTotal, 'Other credits total mismatch', 0.01);
  pushMismatch(
    'electronic_debits_count_mismatch',
    expected.electronicDebitsCount,
    actual.electronicDebitsCount,
    'Electronic debits item count mismatch'
  );
  pushMismatch(
    'electronic_debits_total_mismatch',
    expected.electronicDebitsTotal,
    actual.electronicDebitsTotal,
    'Electronic debits total mismatch',
    0.01
  );
  pushMismatch('checks_count_mismatch', expected.checksCount, actual.checksCount, 'Checks cleared item count mismatch');
  pushMismatch('checks_total_mismatch', expected.checksTotal, actual.checksTotal, 'Checks cleared total mismatch', 0.01);
  pushMismatch(
    'daily_balances_count_mismatch',
    expected.dailyBalancesCount,
    actual.dailyBalancesCount,
    'Daily balances count mismatch'
  );

  return {
    statementId: args.statementId,
    passed: mismatches.length === 0,
    expected,
    actual,
    mismatches
  };
};

export const buildStatementEvidenceRows = (args: {
  statementId: string;
  sourceDocumentId: string;
  parserVersion: string;
  rows: ParsedStatementRow[];
}) =>
  args.rows.map((row) => ({
    id: row.localId ?? `${args.statementId}-${row.postDate}-${row.amount}`,
    statementId: args.statementId,
    sourceDocumentId: args.sourceDocumentId,
    page: Number(row.sourceLocator?.pageNumber ?? 1),
    section: row.section,
    sourceText: String(row.sourceLocator?.sourceText ?? row.description ?? ''),
    boundingBox: null,
    screenshotRef: null,
    parserVersion: args.parserVersion
  }));
