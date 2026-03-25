export type GoogleSheetsSyncOverview = {
  totalEntries: number;
  lastUpdatedAt: string | null;
  byProfile: Array<{
    profileName: string;
    entries: number;
    lastUpdatedAt: string | null;
  }>;
};

export type QuickBooksOAuthStatus = {
  ok: boolean;
  reason: string | null;
  environment?: 'sandbox' | 'production';
  realmId: string | null;
  companyName: string | null;
  expiresInSec: number | null;
};

export type SyncProgressState = {
  percent: number;
  stage: string;
} | null;
