export type StatementPostingQbTxnType =
  | 'Expense'
  | 'Deposit'
  | 'Transfer'
  | 'Check'
  | 'SalesReceipt'
  | 'Payment';

export type StatementPostingPreviewInput = {
  qbTxnType: StatementPostingQbTxnType;
  amount: number;
  direction: 'debit' | 'credit';
  bankAccountLabel?: string;
  lineAccountLabel?: string;
  transferToAccountLabel?: string;
  payeeName?: string;
  checkNumber?: string;
  matchedExisting?: boolean;
};

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Math.abs(amount));

export const buildStatementPostingPreviewLines = (input: StatementPostingPreviewInput): string[] => {
  const amt = money(input.amount);
  const bank = input.bankAccountLabel?.trim() || 'Bank account';
  const line = input.lineAccountLabel?.trim() || 'Category / income account';
  const payee = input.payeeName?.trim();
  const lines: string[] = [];

  switch (input.qbTxnType) {
    case 'Deposit':
      lines.push(`QuickBooks: Deposit — increases ${bank} by ${amt}.`);
      lines.push(`Deposit to: ${bank}`);
      lines.push(`Line account (income / other credit): ${line}`);
      if (payee) lines.push(`Received from: ${payee}`);
      lines.push('Register: amount appears in the Deposit column.');
      break;
    case 'SalesReceipt':
      lines.push(`QuickBooks: Sales Receipt — increases ${bank} by ${amt}.`);
      lines.push(`Deposit to: ${bank}`);
      if (payee) lines.push(`Customer: ${payee}`);
      lines.push(`Revenue / item posts to income (not the bank account).`);
      lines.push('Register: deposit increases bank balance.');
      break;
    case 'Payment':
      lines.push(`QuickBooks: Payment — increases ${bank} by ${amt}.`);
      lines.push(`Deposit to: ${bank}`);
      if (payee) lines.push(`Customer: ${payee}`);
      lines.push('Register: customer payment increases bank balance.');
      break;
    case 'Expense':
      lines.push(`QuickBooks: Expense — decreases ${bank} by ${amt}.`);
      lines.push(`Paid from: ${bank}`);
      lines.push(`Category: ${line}`);
      if (payee) lines.push(`Vendor / payee: ${payee}`);
      lines.push('Register: amount appears in the Payment column.');
      break;
    case 'Check':
      if (input.matchedExisting) {
        lines.push(
          `QuickBooks: Match existing check #${input.checkNumber ?? '?'} — no new check created.`
        );
        lines.push(`Links cleared check on ${bank} for ${amt}.`);
      } else {
        lines.push(`QuickBooks: Check — decreases ${bank} by ${amt}.`);
        lines.push(`Paid from: ${bank}`);
        lines.push(`Category: ${line}`);
        if (input.checkNumber) lines.push(`Check number: ${input.checkNumber}`);
        if (payee) lines.push(`Payee: ${payee}`);
        lines.push('Register: amount appears in the Payment column.');
      }
      break;
    case 'Transfer': {
      const to = input.transferToAccountLabel?.trim() || 'Other bank account';
      lines.push(`QuickBooks: Transfer — ${amt} between bank accounts.`);
      lines.push(`From: ${bank}`);
      lines.push(`To: ${to}`);
      lines.push('Register: decreases one bank account and increases the other.');
      break;
    }
    default:
      lines.push('QuickBooks posting type not configured.');
  }

  return lines;
};
