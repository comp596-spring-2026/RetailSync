import { describe, expect, it } from 'vitest';
import {
  filterDepositLineAccounts,
  isCheckSuggestionItem,
  isGenericBankDepositRow,
  pickDefaultDepositLineAccount,
  resolveCheckNumberForReview,
  resolveLinkedCheck
} from './statementDetailHelpers';
import type { QuickBooksHubChartAccount } from '@retailsync/shared';
import type { StatementCheck, StatementSuggestionItem } from '@retailsync/shared';

const baseItem = (overrides: Partial<StatementSuggestionItem>): StatementSuggestionItem => ({
  id: 'item-1',
  source: 'transaction',
  description: 'Vendor payment',
  amount: 100,
  direction: 'debit',
  reasons: [],
  matchedRuleIds: [],
  matchedRuleNames: [],
  ...overrides
});

const baseCheck = (overrides: Partial<StatementCheck>): StatementCheck => ({
  id: 'check-1',
  statementId: 'stmt-1',
  companyId: 'co-1',
  status: 'ready',
  gcs: { frontPath: 'path/front.jpg' },
  ...overrides
});

describe('statementDetailHelpers check review', () => {
  it('detects check suggestion rows', () => {
    expect(isCheckSuggestionItem(baseItem({ source: 'check', section: 'checks_cleared' }))).toBe(true);
    expect(isCheckSuggestionItem(baseItem({ checkNumber: '0205', section: 'electronic_debits' }))).toBe(true);
    expect(isCheckSuggestionItem(baseItem({ section: 'electronic_debits' }))).toBe(false);
  });

  it('detects generic bank deposit rows', () => {
    expect(
      isGenericBankDepositRow({
        direction: 'credit',
        description: '03/02/2026 DEPOSIT $3,085.00',
        proposedTxnType: 'Deposit'
      })
    ).toBe(true);
    expect(
      isGenericBankDepositRow({
        direction: 'debit',
        description: 'DEPOSIT reversal',
        proposedTxnType: 'Deposit'
      })
    ).toBe(false);
  });

  it('filters deposit line accounts across income, liability, and equity', () => {
    const accounts: QuickBooksHubChartAccount[] = [
      {
        id: 'rev-1',
        qbId: 'qb-rev',
        name: 'Sales Income',
        type: 'revenue',
        detailType: 'SalesOfProductIncome',
        status: 'active',
        balance: null
      },
      {
        id: 'liab-1',
        qbId: 'qb-liab',
        name: 'POS Clearing',
        type: 'liability',
        detailType: 'OtherCurrentLiability',
        status: 'active',
        balance: null
      },
      {
        id: 'bank-1',
        qbId: 'qb-bank',
        name: 'Operating Checking',
        type: 'asset',
        detailType: 'Checking',
        status: 'active',
        balance: null
      }
    ];
    const filtered = filterDepositLineAccounts(accounts);
    expect(filtered.map((row) => row.id)).toEqual(['rev-1', 'liab-1']);
    expect(pickDefaultDepositLineAccount(accounts)?.id).toBe('rev-1');
  });

  it('resolves linked check and check number from check record', () => {
    const item = baseItem({ source: 'check', id: 'check-1', linkedCheckId: 'check-1' });
    const checks = [
      baseCheck({
        id: 'check-1',
        extracted: { checkNumber: '0205', amount: 596.16, source: 'ocr' }
      })
    ];
    const linked = resolveLinkedCheck(item, checks);
    expect(linked?.id).toBe('check-1');
    expect(resolveCheckNumberForReview(item, linked)).toBe('0205');
  });
});
