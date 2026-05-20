export const STATEMENT_BANK_ACCOUNT_STORAGE_KEY = 'accounting.statement.defaultBankAccountId';

export const readDefaultStatementBankAccountId = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(STATEMENT_BANK_ACCOUNT_STORAGE_KEY)?.trim() ?? '';
};

export const writeDefaultStatementBankAccountId = (qbAccountId: string) => {
  if (typeof window === 'undefined') return;
  const trimmed = qbAccountId.trim();
  if (!trimmed) {
    window.localStorage.removeItem(STATEMENT_BANK_ACCOUNT_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STATEMENT_BANK_ACCOUNT_STORAGE_KEY, trimmed);
};
