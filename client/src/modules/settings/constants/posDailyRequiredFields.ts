export const POS_DAILY_REQUIRED_FIELDS = [
  'date',
  'highTax',
  'lowTax',
  'saleTax',
  'gas',
  'lottery',
  'creditCard',
  'lotteryPayout',
  'cashExpenses',
] as const;

export type PosDailyRequiredField = (typeof POS_DAILY_REQUIRED_FIELDS)[number];
