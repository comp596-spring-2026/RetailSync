import { dateRangeSummaryQuerySchema, monthlySummaryQuerySchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { fail, ok } from '../utils/apiResponse';

type SummaryRow = {
  highTax: number;
  lowTax: number;
  saleTax: number;
  totalSales: number;
  gas: number;
  lottery: number;
  creditCard: number;
  cash: number;
  lotteryPayout: number;
  cashPayout: number;
  cashExpenses: number;
};

type SummaryResult = {
  month: string;
  days: number;
  sumHighTax: number;
  sumLowTax: number;
  sumSaleTax: number;
  sumTotalSales: number;
  sumGas: number;
  sumLottery: number;
  sumCreditCard: number;
  sumCash: number;
  sumLotteryPayout: number;
  sumCashPayout: number;
  sumCashExpenses: number;
  expectedCardDeposit: number;
  expectedCashDeposit: number;
  eftExpected: number;
};

function buildSummaryFromRows(rows: SummaryRow[], rangeLabel: string): SummaryResult {
  const acc: SummaryResult = {
    month: rangeLabel,
    days: 0,
    sumHighTax: 0,
    sumLowTax: 0,
    sumSaleTax: 0,
    sumTotalSales: 0,
    sumGas: 0,
    sumLottery: 0,
    sumCreditCard: 0,
    sumCash: 0,
    sumLotteryPayout: 0,
    sumCashPayout: 0,
    sumCashExpenses: 0,
    expectedCardDeposit: 0,
    expectedCashDeposit: 0,
    eftExpected: 0
  };
  for (const row of rows) {
    acc.days += 1;
    acc.sumHighTax += row.highTax;
    acc.sumLowTax += row.lowTax;
    acc.sumSaleTax += row.saleTax;
    acc.sumTotalSales += row.totalSales;
    acc.sumGas += row.gas;
    acc.sumLottery += row.lottery;
    acc.sumCreditCard += row.creditCard;
    acc.sumCash += row.cash;
    acc.sumLotteryPayout += row.lotteryPayout;
    acc.sumCashPayout += row.cashPayout;
    acc.sumCashExpenses += row.cashExpenses;
    acc.expectedCardDeposit += row.creditCard;
    acc.expectedCashDeposit += row.cash - row.cashPayout - row.cashExpenses;
    acc.eftExpected += row.creditCard - row.gas;
  }
  return acc;
}

export const monthlySummary = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = monthlySummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const [year, month] = parsed.data.month.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  const rows = await POSDailySummaryModel.find({
    companyId: req.companyId,
    date: { $gte: start, $lte: end }
  });

  const totals = buildSummaryFromRows(rows, parsed.data.month);
  return ok(res, totals);
};

export const dateRangeSummary = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = dateRangeSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const start = new Date(parsed.data.from + 'T00:00:00.000Z');
  const end = new Date(parsed.data.to + 'T23:59:59.999Z');

  const rows = await POSDailySummaryModel.find({
    companyId: req.companyId,
    date: { $gte: start, $lte: end }
  });

  const rangeLabel = `${parsed.data.from} to ${parsed.data.to}`;
  const totals = buildSummaryFromRows(rows, rangeLabel);
  return ok(res, totals);
};
