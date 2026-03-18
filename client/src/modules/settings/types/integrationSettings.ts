import type { GoogleSheetsCanonicalSettings } from './googleSheets';
import type { QuickBooksCanonicalSettings } from './quickbooks';

export type IntegrationSettingsCanonical = {
  id: string;
  companyId: string;
  ownerUserId: string;
  googleSheets: GoogleSheetsCanonicalSettings;
  quickbooks: QuickBooksCanonicalSettings;
  lastImportSource?: 'file' | 'google_sheets' | null;
  lastImportAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
