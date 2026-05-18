/**
 * Maps a bank-statement row to the default QuickBooks money transaction type.
 * Credits default to money-in (Deposit); debits default to money-out (Expense),
 * except transfers and cleared checks which have explicit types.
 */
export const inferDefaultQuickBooksTxnType = (args: {
  type: 'debit' | 'credit';
  section?: string;
  transactionFamily?: string;
  rowType?: string;
  description?: string;
}): 'Expense' | 'Deposit' | 'Transfer' | 'Check' => {
  const desc = args.description ?? '';
  const transferish =
    args.transactionFamily === 'transfer' ||
    /\binternet\s+transfer\b/i.test(desc) ||
    /\btransfer\s+(from|to)\b/i.test(desc);

  if (args.type === 'credit') {
    if (transferish) return 'Transfer';
    return 'Deposit';
  }

  if (transferish) return 'Transfer';
  if (args.section === 'checks_cleared' || args.rowType === 'check_cleared') {
    return 'Check';
  }
  return 'Expense';
};
