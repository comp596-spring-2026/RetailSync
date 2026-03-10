import { QuickBooksReferenceModel } from '../models/QuickBooksReference';
import { LedgerEntryModel } from '../models/LedgerEntry';

type MatchingInput = {
  companyId: string;
  description: string;
  merchant?: string;
  amount: number;
  type: 'debit' | 'credit';
  check?: {
    payeeName?: string;
    amount?: number;
  };
};

type MatchingResult = {
  qbTxnType: 'Expense' | 'Deposit' | 'Transfer' | 'Check';
  categoryAccountId?: string;
  payeeType?: 'vendor' | 'customer' | 'employee' | 'other';
  payeeId?: string;
  payeeName?: string;
  memo?: string;
  confidence: number;
  reasons: string[];
  version: 'v1';
};

const HARD_RULES: Array<{ pattern: RegExp; qbTxnType: MatchingResult['qbTxnType']; category: string; reason: string }> = [
  {
    pattern: /amzn|amazon/i,
    qbTxnType: 'Expense',
    category: 'Office Supplies',
    reason: 'Rule matched: AMZN/Amazon -> Office Supplies'
  },
  {
    pattern: /transfer/i,
    qbTxnType: 'Transfer',
    category: 'Transfer',
    reason: 'Rule matched: transfer keyword'
  },
  {
    pattern: /payroll|salary/i,
    qbTxnType: 'Expense',
    category: 'Payroll Expense',
    reason: 'Rule matched: payroll keyword'
  }
];

const normalize = (value?: string) => String(value ?? '').trim().toLowerCase();

const similarity = (a: string, b: string) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
};

export const buildMatchingProposal = async (input: MatchingInput): Promise<MatchingResult> => {
  const reasons: string[] = [];
  let score = 0.2;

  const joinedText = `${input.description} ${input.merchant ?? ''}`.trim();
  const hardRule = HARD_RULES.find((rule) => rule.pattern.test(joinedText));

  let qbTxnType: MatchingResult['qbTxnType'] = input.type === 'debit' ? 'Expense' : 'Deposit';
  let categoryAccountId: string | undefined;

  if (hardRule) {
    qbTxnType = hardRule.qbTxnType;
    categoryAccountId = hardRule.category;
    score += 0.35;
    reasons.push(hardRule.reason);
  }

  if (input.check?.payeeName) {
    const payeeNameNorm = normalize(input.check.payeeName);
    const entities = await QuickBooksReferenceModel.find({
      companyId: input.companyId,
      entityType: { $in: ['vendor', 'customer', 'employee'] },
      active: true
    })
      .select('entityType qbId displayName')
      .limit(500)
      .lean();

    let best:
      | {
          score: number;
          entityType: 'vendor' | 'customer' | 'employee';
          qbId: string;
          displayName: string;
        }
      | undefined;

    for (const entity of entities) {
      const current = similarity(payeeNameNorm, normalize(entity.displayName));
      if (!best || current > best.score) {
        best = {
          score: current,
          entityType: entity.entityType,
          qbId: String(entity.qbId),
          displayName: String(entity.displayName)
        };
      }
    }

    if (best && best.score >= 0.65) {
      score += Math.min(0.25, best.score * 0.25);
      reasons.push(
        `Entity resolution: ${best.displayName} (${best.entityType}) ${best.score.toFixed(2)}`
      );
      return {
        qbTxnType,
        categoryAccountId,
        payeeType: best.entityType,
        payeeId: best.qbId,
        payeeName: best.displayName,
        memo: input.description,
        confidence: Number(Math.min(0.98, score).toFixed(2)),
        reasons,
        version: 'v1'
      };
    }
  }

  const historical = await LedgerEntryModel.find({
    companyId: input.companyId,
    reviewStatus: 'approved',
    description: { $regex: input.description.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24), $options: 'i' }
  })
    .select('proposal amount')
    .limit(20)
    .lean();

  if (historical.length > 0) {
    score += 0.2;
    const matched = historical.filter((item) => Math.abs(Number(item.amount) - Math.abs(input.amount)) < 0.01).length;
    if (matched > 0) {
      score += 0.1;
      reasons.push(`Historical match: ${matched} similar amount + description records`);
    } else {
      reasons.push(`Historical match: ${historical.length} similar description records`);
    }

    const first = historical[0] as { proposal?: { qbTxnType?: MatchingResult['qbTxnType']; categoryAccountId?: string } };
    if (first?.proposal?.qbTxnType) {
      qbTxnType = first.proposal.qbTxnType;
      reasons.push(`Historical proposal reused txn type: ${qbTxnType}`);
    }
    if (first?.proposal?.categoryAccountId) {
      categoryAccountId = first.proposal.categoryAccountId;
      reasons.push('Historical proposal reused category account');
    }
  }

  if (input.type === 'debit' && input.check?.payeeName) {
    qbTxnType = 'Check';
    reasons.push('Check evidence present for debit transaction');
    score += 0.1;
  }

  if (reasons.length === 0) {
    reasons.push('Low-signal fallback proposal generated from debit/credit direction');
  }

  return {
    qbTxnType,
    categoryAccountId,
    memo: input.description,
    confidence: Number(Math.min(0.98, score).toFixed(2)),
    reasons,
    version: 'v1'
  };
};
