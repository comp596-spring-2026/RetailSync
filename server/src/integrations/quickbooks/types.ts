export type QuickBooksEnvironment = 'sandbox' | 'production';

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

export type QuickBooksJournalLineInput = {
  accountId: string;
  amount: number;
  postingType: 'Debit' | 'Credit';
  description?: string;
};
