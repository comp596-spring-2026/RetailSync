import type { StatementSection } from '@retailsync/shared';

export type SectionWorkflowHint = {
  primary: string;
  alternatives: string[];
};

const creditSections = new Set<StatementSection>(['deposits', 'electronic_credits', 'other_credits']);
const debitSections = new Set<StatementSection>(['electronic_debits', 'checks_cleared']);

export const sectionDirection = (sectionKey: string): 'credit' | 'debit' | 'unknown' => {
  if (creditSections.has(sectionKey as StatementSection)) return 'credit';
  if (debitSections.has(sectionKey as StatementSection)) return 'debit';
  return 'unknown';
};

export const sectionReviewType = (sectionKey: string): string => {
  if (sectionKey === 'checks_cleared') return 'Check review';
  if (sectionKey === 'deposits') return 'Deposit review';
  if (creditSections.has(sectionKey as StatementSection)) return 'Credit review';
  if (debitSections.has(sectionKey as StatementSection)) return 'Debit review';
  return 'Transaction review';
};

export const sectionWorkflowHint = (sectionKey: string): SectionWorkflowHint => {
  switch (sectionKey) {
    case 'deposits':
      return { primary: 'Deposit', alternatives: ['Sales Receipt', 'Transfer'] };
    case 'electronic_credits':
      return { primary: 'Deposit', alternatives: ['Transfer', 'Journal Entry'] };
    case 'other_credits':
      return { primary: 'Sales Receipt', alternatives: ['Deposit', 'Journal Entry'] };
    case 'electronic_debits':
      return { primary: 'Expense', alternatives: ['Bill Payment', 'Transfer'] };
    case 'checks_cleared':
      return { primary: 'Check', alternatives: ['Expense', 'Bill Payment'] };
    default:
      if (sectionDirection(sectionKey) === 'credit') {
        return { primary: 'Deposit', alternatives: ['Transfer', 'Journal Entry'] };
      }
      if (sectionDirection(sectionKey) === 'debit') {
        return { primary: 'Expense', alternatives: ['Bill Payment', 'Transfer'] };
      }
      return { primary: 'Review', alternatives: [] };
  }
};

export const formatWorkflowHint = (hint: SectionWorkflowHint) => {
  const parts = [hint.primary, ...hint.alternatives];
  return parts.join(' / ');
};

/** Stable display order for known sections; unknown keys sort after. */
export const SECTION_DISPLAY_ORDER: string[] = [
  'deposits',
  'electronic_credits',
  'other_credits',
  'electronic_debits',
  'checks_cleared',
  'daily_balances',
  'unknown'
];

export const compareSectionKeys = (a: string, b: string) => {
  const ai = SECTION_DISPLAY_ORDER.indexOf(a);
  const bi = SECTION_DISPLAY_ORDER.indexOf(b);
  const aRank = ai === -1 ? SECTION_DISPLAY_ORDER.length + 1 : ai;
  const bRank = bi === -1 ? SECTION_DISPLAY_ORDER.length + 1 : bi;
  if (aRank !== bRank) return aRank - bRank;
  return a.localeCompare(b);
};
