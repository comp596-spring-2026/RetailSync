import type { BankStatementStatus } from '@retailsync/shared';

/** e.g. `2025-12` → `Dec 2025` (UTC) */
export const formatStatementMonthShort = (statementMonth: string) => {
  const [y, m] = statementMonth.split('-');
  if (!y || !m || m.length !== 2) return statementMonth;
  const d = new Date(`${y}-${m}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return statementMonth;
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

/** Short verb for list/detail titles (e.g. "Dec 2025 · Extracting"). */
export const getStatementStatusPhrase = (status: BankStatementStatus) => {
  switch (status) {
    case 'uploaded':
      return 'Queued';
    case 'extracting':
      return 'Extracting';
    case 'structuring':
      return 'Structuring';
    case 'checks_queued':
      return 'Checks';
    case 'ready_for_review':
      return 'Ready';
    case 'failed':
      return 'Failed';
    default:
      return 'Processing';
  }
};

/** Primary list/detail label: month + status (not the raw upload filename). */
export const buildStatementPrimaryTitle = (
  statementMonth: string,
  status: BankStatementStatus
) => `${formatStatementMonthShort(statementMonth)} · ${getStatementStatusPhrase(status)}`;
