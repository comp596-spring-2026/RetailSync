import { StatementRuleModel } from '../models/StatementRule';

export type RuleCandidateInput = {
  source: 'transaction' | 'check';
  description: string;
  amount: number;
  direction: 'debit' | 'credit';
  date?: string;
  payeeName?: string;
};

const normalize = (value?: string) => String(value ?? '').trim().toLowerCase();

const applyRuleConditions = (
  rule: any,
  input: RuleCandidateInput
) => {
  const conditions = rule.conditions ?? {};
  if (conditions.contains) {
    const needle = normalize(conditions.contains);
    const haystack = normalize(`${input.description} ${input.payeeName ?? ''}`);
    if (!haystack.includes(needle)) return false;
  }
  if (conditions.direction && conditions.direction !== input.direction) return false;
  if (typeof conditions.minAmount === 'number' && Number(input.amount) < Number(conditions.minAmount)) return false;
  if (typeof conditions.maxAmount === 'number' && Number(input.amount) > Number(conditions.maxAmount)) return false;
  if (conditions.dateFrom && input.date && input.date < String(conditions.dateFrom)) return false;
  if (conditions.dateTo && input.date && input.date > String(conditions.dateTo)) return false;
  return true;
};

export const listStatementRules = async (statementId: string, companyId: string) => {
  const rows = await StatementRuleModel.find({ statementId, companyId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
  return rows;
};

export const evaluateStatementRules = (rules: any[], input: RuleCandidateInput) => {
  const matched = rules.filter((rule) => Boolean(rule.enabled) && applyRuleConditions(rule, input));
  return matched.map((rule) => ({
    id: String(rule._id),
    name: String(rule.name ?? 'Unnamed rule'),
    hardness: String(rule.hardness ?? 'soft') as 'soft' | 'hard',
    action: rule.action ?? {}
  }));
};
