import { inferDefaultQuickBooksTxnType } from '@retailsync/shared';

export type WorkflowTxnType =
  | 'Expense'
  | 'Check'
  | 'Bill'
  | 'BillPayment'
  | 'Deposit'
  | 'CustomerPayment'
  | 'SalesReceipt'
  | 'Transfer'
  | 'JournalEntry';

export type WorkflowDirection = 'debit' | 'credit';

export type CategoryPreset = {
  id: string;
  label: string;
  group: string;
  keywords: RegExp;
  quickbooksAccountType: 'expense' | 'cogs' | 'other_expense' | 'income' | 'other_income' | 'bank';
};

export const expenseCategoryPresets: CategoryPreset[] = [
  {
    id: 'utilities.waste',
    label: 'Utilities:Waste Management',
    group: 'Utilities',
    keywords: /(waste|wm\s|republic services|trash|garbage|sanitation)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'utilities.internet',
    label: 'Utilities:Internet (WiFi)',
    group: 'Utilities',
    keywords: /(wifi|internet|comcast|xfinity|spectrum|fios|verizon|at\s*&\s*t|centurylink)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'utilities.security',
    label: 'Utilities:Security / Alarm',
    group: 'Utilities',
    keywords: /(adt|security|alarm|vivint|brinks|safetouch|guard)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'utilities.electric',
    label: 'Utilities:Electric',
    group: 'Utilities',
    keywords: /(electric|power|energy|duke energy|fpl|georgia power|con edison)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'utilities.water',
    label: 'Utilities:Water & Sewer',
    group: 'Utilities',
    keywords: /(water|sewer|utilities water)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'utilities.gas',
    label: 'Utilities:Gas',
    group: 'Utilities',
    keywords: /(gas company|natural gas|nicor|piedmont)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'utilities.phone',
    label: 'Utilities:Telephone',
    group: 'Utilities',
    keywords: /(verizon wireless|t-?mobile|sprint|phone|cellular)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'rent.lease',
    label: 'Rent or Lease',
    group: 'Occupancy',
    keywords: /(rent|lease|landlord|property mgmt|property management)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'payroll.adp',
    label: 'Payroll:ADP Service',
    group: 'Payroll',
    keywords: /(adp|gusto|paychex|paylocity|rippling)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'payroll.wages',
    label: 'Payroll:Wages',
    group: 'Payroll',
    keywords: /(payroll|wage|salary|direct deposit payroll)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'payroll.taxes',
    label: 'Payroll Taxes',
    group: 'Payroll',
    keywords: /(941|940|payroll tax|eftps|irs usataxpymt|state tax|sui|futa)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'subscriptions.intuit',
    label: 'Software Subscriptions:Intuit',
    group: 'Software',
    keywords: /(intuit|quickbooks|qb online|turbotax)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'subscriptions.software',
    label: 'Software Subscriptions',
    group: 'Software',
    keywords: /(google|microsoft|office 365|adobe|dropbox|slack|zoom|shopify|square|stripe|toast)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'bank.fees',
    label: 'Bank Service Charges',
    group: 'Bank & Finance',
    keywords: /(bank\s*fee|service charge|nsf|overdraft|maintenance fee|wire fee|monthly service|analysis fee)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'cc.fees',
    label: 'Merchant / Credit Card Fees',
    group: 'Bank & Finance',
    keywords: /(merchant|bankcard|visa fee|mastercard fee|discover fee|amex fee|interchange|chargeback)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'cogs.inventory',
    label: 'COGS:Inventory Purchases',
    group: 'Cost of Goods Sold',
    keywords: /(wholesale|distributor|inventory|merchandise|supplier|vendor invoice|coca cola|pepsi|anheuser|frito|nestle|sysco|us foods)/i,
    quickbooksAccountType: 'cogs'
  },
  {
    id: 'cogs.freight',
    label: 'COGS:Freight & Shipping',
    group: 'Cost of Goods Sold',
    keywords: /(freight|shipping|ups|fedex|usps|dhl|trucking)/i,
    quickbooksAccountType: 'cogs'
  },
  {
    id: 'cogs.lottery',
    label: 'COGS:Lottery Tickets',
    group: 'Cost of Goods Sold',
    keywords: /(lottery ticket|lottery purchase|scratch-?off)/i,
    quickbooksAccountType: 'cogs'
  },
  {
    id: 'insurance',
    label: 'Insurance',
    group: 'Operating',
    keywords: /(insurance|state farm|geico|liberty mutual|progressive|allstate|workers comp)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'supplies.office',
    label: 'Office Supplies',
    group: 'Operating',
    keywords: /(staples|office depot|amazon biz|office supplies)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'supplies.store',
    label: 'Store / Cleaning Supplies',
    group: 'Operating',
    keywords: /(costco|sams club|walmart|target|home depot|lowes|cleaning|janitorial)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'professional.fees',
    label: 'Professional Fees (CPA / Legal)',
    group: 'Operating',
    keywords: /(cpa|accountant|bookkeep|legal|attorney|law office|consulting)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'maintenance',
    label: 'Repairs & Maintenance',
    group: 'Operating',
    keywords: /(repair|maintenance|plumber|electrician|hvac|handyman)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'taxes.licenses',
    label: 'Taxes & Licenses',
    group: 'Operating',
    keywords: /(dept of revenue|dor|tax commission|license|permit|tag|registration)/i,
    quickbooksAccountType: 'expense'
  },
  {
    id: 'travel.meals',
    label: 'Travel / Meals',
    group: 'Operating',
    keywords: /(uber|lyft|airline|delta|united|marriott|hotel|restaurant|starbucks|doordash|ubereats)/i,
    quickbooksAccountType: 'expense'
  }
];

export const incomeCategoryPresets: CategoryPreset[] = [
  {
    id: 'income.sales',
    label: 'Sales Income',
    group: 'Income',
    keywords: /(sales|pos deposit|store deposit|cash deposit|daily deposit)/i,
    quickbooksAccountType: 'income'
  },
  {
    id: 'income.merchant',
    label: 'Merchant Card Income',
    group: 'Income',
    keywords: /(merchant deposit|bankcard deposit|visa deposit|mastercard deposit|amex deposit|square|stripe|clover)/i,
    quickbooksAccountType: 'income'
  },
  {
    id: 'income.lottery',
    label: 'Lottery Commission Income',
    group: 'Income',
    keywords: /(lottery commission|lottery comm|state lottery)/i,
    quickbooksAccountType: 'income'
  },
  {
    id: 'income.buydown',
    label: 'Manufacturer Buydown Income',
    group: 'Income',
    keywords: /(buydown|buy down|rebate|manufacturer rebate|vendor rebate|scan rebate)/i,
    quickbooksAccountType: 'other_income'
  },
  {
    id: 'income.refund',
    label: 'Refund / Return',
    group: 'Income',
    keywords: /(refund|return|chargeback reversal)/i,
    quickbooksAccountType: 'other_income'
  },
  {
    id: 'income.interest',
    label: 'Interest Income',
    group: 'Income',
    keywords: /(interest|dividend)/i,
    quickbooksAccountType: 'other_income'
  },
  {
    id: 'income.other',
    label: 'Other Income',
    group: 'Income',
    keywords: /(misc|other income|adjustment credit)/i,
    quickbooksAccountType: 'other_income'
  }
];

export const salesReceiptItemPresets: Array<{ id: string; label: string; group: string; income: string }> = [
  { id: 'item.retail', label: 'Retail Sale', group: 'POS Items', income: 'Sales Income' },
  { id: 'item.service', label: 'Service', group: 'POS Items', income: 'Service Income' },
  { id: 'item.lottery', label: 'Lottery Ticket', group: 'POS Items', income: 'Lottery Commission Income' },
  { id: 'item.buydown', label: 'Manufacturer Buydown', group: 'POS Items', income: 'Manufacturer Buydown Income' },
  { id: 'item.giftcard', label: 'Gift Card', group: 'POS Items', income: 'Sales Income' },
  { id: 'item.tip', label: 'Tips', group: 'POS Items', income: 'Service Income' }
];

export const suggestWorkflowType = (args: {
  direction: WorkflowDirection;
  description: string;
  transactionFamily?: string;
  proposedTxnType?: string;
  checkNumber?: string | null;
  section?: string;
  rowType?: string;
}): WorkflowTxnType => {
  const inferred = inferDefaultQuickBooksTxnType({
    type: args.direction,
    section: args.section,
    transactionFamily: args.transactionFamily,
    rowType: args.rowType,
    description: args.description
  });

  if (args.proposedTxnType === 'Transfer' || args.transactionFamily === 'transfer') {
    return 'Transfer';
  }

  if (args.direction === 'credit') {
    if (args.proposedTxnType === 'SalesReceipt') return 'SalesReceipt';
    if (inferred === 'Transfer') return 'Transfer';
    const salesMatch = incomeCategoryPresets.find((preset) => preset.keywords.test(args.description));
    if (
      salesMatch &&
      (salesMatch.id === 'income.sales' ||
        salesMatch.id === 'income.merchant' ||
        salesMatch.id === 'income.buydown' ||
        salesMatch.id === 'income.lottery')
    ) {
      return 'SalesReceipt';
    }
    return 'Deposit';
  }

  // debit — money leaving the bank
  if (args.proposedTxnType === 'Bill') return 'Bill';
  if (args.proposedTxnType === 'Check' && inferred === 'Check') return 'Check';
  if (inferred === 'Transfer') return 'Transfer';
  if (inferred === 'Check') return 'Check';
  return 'Expense';
};

export const suggestCategoryPreset = (args: {
  direction: WorkflowDirection;
  description: string;
}): CategoryPreset | null => {
  const pool = args.direction === 'credit' ? incomeCategoryPresets : expenseCategoryPresets;
  return pool.find((preset) => preset.keywords.test(args.description)) ?? null;
};

export const mapWorkflowToProposedType = (
  type: WorkflowTxnType
): 'Expense' | 'Deposit' | 'Transfer' | 'Check' | 'SalesReceipt' | 'Payment' | undefined => {
  switch (type) {
    case 'Expense':
    case 'Bill':
    case 'BillPayment':
    case 'JournalEntry':
      return 'Expense';
    case 'Check':
      return 'Check';
    case 'Deposit':
      return 'Deposit';
    case 'SalesReceipt':
      return 'SalesReceipt';
    case 'CustomerPayment':
      return 'Payment';
    case 'Transfer':
      return 'Transfer';
    default:
      return undefined;
  }
};

export const workflowTypeDescription = (type: WorkflowTxnType) => {
  switch (type) {
    case 'Expense':
      return 'Money out via ACH, debit card, EFT. Needs a vendor and a category (COGS / expense).';
    case 'Check':
      return 'Money out via paper check. Same as Expense + check number.';
    case 'Bill':
      return 'Vendor invoice to be paid later. Posts to A/P, then Bill Payment clears it.';
    case 'BillPayment':
      return 'Payment applied to an existing Bill. Needs the original bill reference.';
    case 'Deposit':
      return 'Money in recorded as Other Income, refund, interest, etc. Posts a Deposit (bank + income line).';
    case 'CustomerPayment':
      return 'Customer payment against invoices or unapplied credit. Posts a QuickBooks Payment to the bank account.';
    case 'SalesReceipt':
      return 'Money in from a sale. Posts a Sales Receipt (customer + item) into the bank account.';
    case 'Transfer':
      return 'Movement between two bank accounts owned by the company. No P&L impact.';
    case 'JournalEntry':
      return 'Free-form debit/credit for adjustments. Use only when other types do not fit.';
  }
};
