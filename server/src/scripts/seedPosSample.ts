import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import mongoose from 'mongoose';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { env } from '../config/env';

const toNumber = (value: string | undefined) => {
  if (!value) return 0;
  const num = Number(value.replace(/[$,\s]/g, ''));
  return Number.isFinite(num) ? num : 0;
};

const toDay = (date: string) =>
  new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC'
  });

const run = async () => {
  await mongoose.connect(env.mongoUri);

  const companyId = process.argv[2];
  if (!companyId) {
    throw new Error('Pass companyId: pnpm --filter @retailsync/server seed:pos <companyId>');
  }

  const filePath = path.resolve(process.cwd(), 'src/data/pos-sample.csv');
  const content = fs.readFileSync(filePath, 'utf8');
  const rows = parse(content, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  const ops = rows.map((row) => {
    const date = row.DATE;
    const highTax = toNumber(row['HIGH TAX']);
    const lowTax = toNumber(row['LOW TAX']);
    const creditCard = toNumber(row['CREDIT CARD']);
    const lottery = toNumber(row['LOTTERY SOLD']);
    const lotteryPayout = toNumber(row['LOTTERY PAYOUT CASH']);
    const cashExpenses = toNumber(row['CASH EXPENSES']);
    const totalSales = highTax + lowTax;

    return {
      updateOne: {
        filter: { companyId, date: new Date(`${date}T00:00:00.000Z`) },
        update: {
          $set: {
            companyId,
            date: new Date(`${date}T00:00:00.000Z`),
            day: toDay(date),
            highTax,
            lowTax,
            saleTax: toNumber(row['SALE TAX']),
            totalSales,
            gas: toNumber(row.GAS),
            lottery,
            creditCard,
            lotteryPayout,
            clTotal: creditCard + lottery,
            cash: totalSales - creditCard,
            cashPayout: lotteryPayout,
            cashExpenses,
            notes: row.DESCRIPTION ?? ''
          }
        },
        upsert: true
      }
    };
  });

  const result = await POSDailySummaryModel.bulkWrite(ops);
  console.log('Seed complete', {
    imported: rows.length,
    upserted: result.upsertedCount,
    modified: result.modifiedCount
  });

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
