import type {
  BankStatementDetail,
  StatementSuggestionItem,
  StatementSuggestionsResponse
} from '@retailsync/shared';
import { useMemo } from 'react';

const getSuggestionBucketLabel = (item: StatementSuggestionItem) => {
  if (item.proposedTxnType) return item.proposedTxnType;
  if (item.source === 'check') return 'Check review';
  return item.direction === 'credit' ? 'Credit review' : 'Debit review';
};

export const useMonthCloseWorkspaceState = (
  statement: BankStatementDetail | null,
  suggestions: StatementSuggestionsResponse | null
) => {
  const suggestionGroups = useMemo(() => {
    const groups = new Map<string, StatementSuggestionItem[]>();
    for (const item of suggestions?.items ?? []) {
      const key = getSuggestionBucketLabel(item);
      const current = groups.get(key) ?? [];
      current.push(item);
      groups.set(key, current);
    }
    return [...groups.entries()];
  }, [suggestions]);

  const monthCloseGates = useMemo(() => {
    if (!statement) {
      return {
        rowsReviewed: false,
        noBlockingExtractionFailures: false,
        noMandatoryUnknowns: false,
        noPendingMandatorySuggestionDecisions: false
      };
    }
    return (
      statement.monthClose?.gates ?? {
        rowsReviewed: false,
        noBlockingExtractionFailures: statement.status !== 'failed',
        noMandatoryUnknowns: false,
        noPendingMandatorySuggestionDecisions: false
      }
    );
  }, [statement]);

  const canCompleteMonth = useMemo(() => Object.values(monthCloseGates).every(Boolean), [monthCloseGates]);

  return { suggestionGroups, monthCloseGates, canCompleteMonth };
};
