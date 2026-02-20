import { monthlySummaryQuerySchema } from '@retailsync/shared';
import { Request, Response } from 'express';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { fail, ok } from '../utils/apiResponse';

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

  const totals = rows.reduce(
    (acc, row) => {
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
      return acc;
    },
    {
      month: parsed.data.month,
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
    }
  );

  return ok(res, totals);
};
