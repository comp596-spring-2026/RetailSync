export type QuickBooksEnvironment = 'sandbox' | 'production';

export type QuickBooksSecretHealth = {
  status: 'healthy' | 'degraded';
  checkedAt: number;
  refreshedAt: number | null;
  accessTokenExpiresAt: number | null;
  accessTokenExpiresInSec: number | null;
  refreshTokenExpiresAt: number | null;
  refreshTokenExpiresInSec: number | null;
  lastRefreshError: string | null;
  lastRefreshErrorAt: number | null;
};

export type QuickBooksSecretPayload = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string | null;
  idToken: string | null;
  realmId: string;
  environment: QuickBooksEnvironment;
  companyName: string | null;
  expiresAt: number | null;
  refreshExpiresAt: number | null;
  updatedAt: number;
  health?: QuickBooksSecretHealth | null;
};

export type QuickBooksTokenApiResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  id_token?: string;
  expires_in?: number | string;
  x_refresh_token_expires_in?: number | string;
  error?: string;
  error_description?: string;
};

export type QuickBooksApiEnvelope = {
  QueryResponse?: Record<string, unknown>;
  Fault?: {
    Error?: Array<{ Message?: string; Detail?: string; code?: string }>;
  };
};

export type QuickBooksQueryParams = Record<string, string | number | undefined | null>;

export type QuickBooksReportName = 'GeneralLedger';

export type QuickBooksTransactionType =
  | 'Purchase'
  | 'Deposit'
  | 'Transfer'
  | 'JournalEntry'
  | 'SalesReceipt'
  | 'Payment'
  | 'Check'
  | 'Invoice'
  | 'Bill'
  | 'CreditMemo';

export type QuickBooksAccountRecord = {
  id: string;
  name: string;
  code: string | null;
  accountType: string | null;
  active: boolean;
};

export type QuickBooksEntityType = 'vendor' | 'customer' | 'employee';

export type QuickBooksEntityRecord = {
  id: string;
  displayName: string;
  active: boolean;
  raw: Record<string, unknown>;
};

export type QuickBooksReadQueryResult = Record<string, unknown>;

export type QuickBooksAccountRegisterQuery = {
  accountId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  query?: QuickBooksQueryParams;
};

export type QuickBooksTransactionDetailRequest = {
  txnType: QuickBooksTransactionType;
  txnId: string;
};

export type QuickBooksTransactionDetailResult = {
  txnType: QuickBooksTransactionType;
  txnId: string;
  row: Record<string, unknown> | null;
  payload: QuickBooksReadQueryResult;
};

export type QuickBooksJournalLineInput = {
  accountId: string;
  amount: number;
  postingType: 'Debit' | 'Credit';
  description?: string;
};

export type QuickBooksTxnCreateResult = {
  txnId: string;
  txnDate: string;
};

export type QuickBooksPrivateNoteInput = {
  memo?: string;
  privateNoteTag?: string;
};

export type QuickBooksSalesItemLineInput = {
  amount: number;
  itemRefId: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  serviceDate?: string;
  taxCodeRefId?: string;
  classRefId?: string;
};

export type QuickBooksPaymentLinkedTxnInput = {
  txnId: string;
  txnType?: 'Invoice' | 'SalesReceipt';
  amount?: number;
};

export type QuickBooksSalesReceiptCreateInput = QuickBooksPrivateNoteInput & {
  companyId: string;
  txnDate: string;
  customerRefId?: string;
  depositToAccountId?: string;
  docNumber?: string;
  lines: QuickBooksSalesItemLineInput[];
};

export type QuickBooksInvoiceCreateInput = QuickBooksPrivateNoteInput & {
  companyId: string;
  txnDate: string;
  customerRefId: string;
  dueDate?: string;
  docNumber?: string;
  customerMemo?: string;
  lines: QuickBooksSalesItemLineInput[];
};

export type QuickBooksPaymentCreateInput = QuickBooksPrivateNoteInput & {
  companyId: string;
  txnDate: string;
  amount: number;
  customerRefId: string;
  depositToAccountId?: string;
  paymentMethodRefId?: string;
  docNumber?: string;
  linkedTxns?: QuickBooksPaymentLinkedTxnInput[];
};
