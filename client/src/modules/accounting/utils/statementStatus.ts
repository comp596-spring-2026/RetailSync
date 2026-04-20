import type { BankStatementStatus } from '@retailsync/shared';

export const formatStatementStatusLabel = (status: string) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const getStatementStatusColor = (
  status: BankStatementStatus
): 'default' | 'info' | 'warning' | 'success' | 'error' => {
  if (status === 'extracting' || status === 'structuring' || status === 'checks_queued') return 'info';
  if (status === 'ready_for_review') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
};

export const isStatementInFlight = (status: BankStatementStatus) =>
  status === 'uploaded' || status === 'extracting' || status === 'structuring' || status === 'checks_queued';

export const isStatementTerminal = (status: BankStatementStatus) =>
  status === 'ready_for_review' || status === 'failed';
