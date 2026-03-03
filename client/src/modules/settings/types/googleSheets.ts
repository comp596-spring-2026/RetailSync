export type IntegrationMode = 'oauth' | 'shared';
export type ConnectionStatus = 'not_connected' | 'connected' | 'error';

export type SheetConnector = {
  key: string;
  label: string;
  enabled?: boolean;
  spreadsheetId: string;
  spreadsheetTitle?: string | null;
  sheetName: string;
  headerRow?: number;
  mapping: Record<string, string>;
  transformations?: Record<string, unknown>;
  lastImportAt?: string | null;
  mappingConfirmedAt?: string | null;
  mappingHash?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type SharedProfile = {
  id: string;
  name: string;
  connectors: SheetConnector[];
  lastDebugResult?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type OAuthSource = {
  id: string;
  name: string;
  connectors: SheetConnector[];
  lastDebugResult?: unknown;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type GoogleSheetsCanonicalSettings = {
  activeIntegration: IntegrationMode | null;
  oauth: {
    enabled: boolean;
    connectionStatus: ConnectionStatus;
    activeSourceId: string | null;
    activeConnectorKey: string | null;
    sources: OAuthSource[];
    lastDebugResult?: unknown;
    lastImportAt?: string | null;
  };
  shared: {
    enabled: boolean;
    activeProfileId: string | null;
    activeConnectorKey: string | null;
    profiles: SharedProfile[];
    lastDebugResult?: unknown;
    lastImportAt?: string | null;
    lastScheduledSyncAt?: string | null;
  };
  updatedAt?: string | null;
};

export type IntegrationSettingsCanonical = {
  id: string;
  companyId: string;
  ownerUserId: string;
  googleSheets: GoogleSheetsCanonicalSettings;
  quickbooks: {
    connected: boolean;
    environment: 'sandbox' | 'production';
    realmId: string | null;
    companyName: string | null;
  };
  lastImportSource?: 'file' | 'google_sheets' | null;
  lastImportAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
