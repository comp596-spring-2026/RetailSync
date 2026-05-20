import { describe, expect, it } from 'vitest';
import { suggestWorkflowType } from './statementCategoryPresets';

describe('suggestWorkflowType deposit credits', () => {
  it('opens Deposit workflow for generic bank deposit rows', () => {
    expect(
      suggestWorkflowType({
        direction: 'credit',
        description: '03/02/2026 DEPOSIT $3,085.00',
        proposedTxnType: 'Deposit',
        section: 'deposits'
      })
    ).toBe('Deposit');
  });

  it('opens Sales Receipt workflow for electronic credit rows', () => {
    expect(
      suggestWorkflowType({
        direction: 'credit',
        description: '03/03/2026 ELECTRONIC CREDIT POS DEPOSIT 1,200.00',
        proposedTxnType: 'Deposit',
        section: 'electronic_credits',
        rowType: 'electronic_credit'
      })
    ).toBe('SalesReceipt');
  });

  it('opens Sales Receipt workflow for other credit rows', () => {
    expect(
      suggestWorkflowType({
        direction: 'credit',
        description: '03/04/2026 OTHER CREDIT MERCHANT SETTLEMENT 500.00',
        proposedTxnType: 'Deposit',
        section: 'other_credits',
        rowType: 'other_credit'
      })
    ).toBe('SalesReceipt');
  });

  it('prefers Deposit over Sales Receipt when description contains deposit', () => {
    expect(
      suggestWorkflowType({
        direction: 'credit',
        description: 'DEPOSIT merchant settlement',
        proposedTxnType: 'SalesReceipt',
        section: 'deposits'
      })
    ).toBe('Deposit');
  });
});
