import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  statementTransactionFindOneMock,
  statementTransactionFindMock,
  statementTransactionCreateMock,
  statementCheckFindOneMock,
  statementCheckUpdateOneMock,
  ledgerFindOneMock,
  ledgerCreateMock,
  buildMatchingProposalMock
} = vi.hoisted(() => ({
  statementTransactionFindOneMock: vi.fn(),
  statementTransactionFindMock: vi.fn(),
  statementTransactionCreateMock: vi.fn(),
  statementCheckFindOneMock: vi.fn(),
  statementCheckUpdateOneMock: vi.fn(),
  ledgerFindOneMock: vi.fn(),
  ledgerCreateMock: vi.fn(),
  buildMatchingProposalMock: vi.fn()
}));

vi.mock('../models/StatementTransaction', () => ({
  StatementTransactionModel: {
    findOne: statementTransactionFindOneMock,
    find: statementTransactionFindMock,
    create: statementTransactionCreateMock
  }
}));

vi.mock('../models/StatementCheck', () => ({
  StatementCheckModel: {
    findOne: statementCheckFindOneMock,
    updateOne: statementCheckUpdateOneMock
  }
}));

vi.mock('../models/LedgerEntry', () => ({
  LedgerEntryModel: {
    findOne: ledgerFindOneMock,
    create: ledgerCreateMock
  }
}));

vi.mock('./matchingEngine', () => ({
  buildMatchingProposal: buildMatchingProposalMock
}));

describe('resolveStatementEntryForCheckSuggestion', () => {
  const companyId = 'company-1';
  const statementId = 'statement-1';
  const checkId = '6a0e0853da00376987bb9b5b';

  beforeEach(() => {
    vi.clearAllMocks();
    buildMatchingProposalMock.mockResolvedValue({
      qbTxnType: 'Check',
      categoryAccountId: 'Office Supplies',
      payeeName: 'Staples',
      confidence: 0.8,
      reasons: ['Rule matched'],
      version: 'v1'
    });
    ledgerFindOneMock.mockResolvedValue(null);
    ledgerCreateMock.mockResolvedValue({});
    statementCheckUpdateOneMock.mockResolvedValue({ acknowledged: true });
  });

  it('returns an existing transaction linked by statementCheckId', async () => {
    const entry = {
      _id: { toString: () => 'txn-1' },
      statementCheckId: checkId,
      save: vi.fn()
    };
    statementTransactionFindOneMock.mockResolvedValueOnce(entry);

    const { resolveStatementEntryForCheckSuggestion } = await import('./statementCheckLinkService');
    const result = await resolveStatementEntryForCheckSuggestion({
      companyId,
      statementId,
      checkId
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linked).toBe('existing');
      expect(result.entry._id.toString()).toBe('txn-1');
    }
    expect(statementCheckFindOneMock).not.toHaveBeenCalled();
  });

  it('backfills statementCheckId when check.match.statementTransactionId is set', async () => {
    statementTransactionFindOneMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        _id: { toString: () => 'txn-matched' },
        statementCheckId: undefined,
        postDate: '2026-03-08',
        description: 'Staples',
        amount: 123.45,
        type: 'debit',
        proposal: { qbTxnType: 'Check' },
        reviewStatus: 'proposed',
        posting: { status: 'not_posted' },
        save: vi.fn().mockResolvedValue(undefined)
      });

    statementCheckFindOneMock.mockResolvedValue({
      _id: { toString: () => checkId },
      match: { statementTransactionId: 'txn-matched', reasons: [] },
      extracted: {
        checkNumber: '1001',
        date: '2026-03-08',
        payeeName: 'Staples',
        amount: 123.45
      },
      gcs: { frontPath: 'checks/front.jpg' },
      save: vi.fn().mockResolvedValue(undefined)
    });

    const { resolveStatementEntryForCheckSuggestion } = await import('./statementCheckLinkService');
    const result = await resolveStatementEntryForCheckSuggestion({
      companyId,
      statementId,
      checkId
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linked).toBe('matched');
      expect(result.entry.statementCheckId).toBe(checkId);
    }
    expect(ledgerCreateMock).toHaveBeenCalled();
  });

  it('creates a statement transaction when no link exists', async () => {
    statementTransactionFindOneMock.mockResolvedValue(null);
    statementTransactionFindMock.mockResolvedValue([]);
    statementCheckFindOneMock.mockResolvedValue({
      _id: { toString: () => checkId },
      match: {},
      extracted: {
        checkNumber: '1002',
        date: '2026-03-09',
        payeeName: 'Office Depot',
        amount: 88.19
      },
      gcs: { frontPath: 'checks/front-2.jpg' }
    });
    statementTransactionCreateMock.mockResolvedValue({
      _id: { toString: () => 'txn-new' }
    });

    const { resolveStatementEntryForCheckSuggestion } = await import('./statementCheckLinkService');
    const result = await resolveStatementEntryForCheckSuggestion({
      companyId,
      statementId,
      checkId,
      statement: { bankAccountId: 'qb-bank-1', gcs: { pdfPath: 'statements/original.pdf' } }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.linked).toBe('created');
    }
    expect(statementTransactionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        statementCheckId: checkId,
        rowType: 'check_cleared',
        checkNumber: '1002'
      })
    );
    expect(ledgerCreateMock).toHaveBeenCalled();
    expect(statementCheckUpdateOneMock).toHaveBeenCalled();
  });
});
