import { api } from '../../../app/api/client';

export type PosDailyRecord = {
  _id: string;
  date: string;
  day: string;
  highTax: number;
  lowTax: number;
  saleTax: number;
  totalSales: number;
  gas: number;
  lottery: number;
  creditCard: number;
  lotteryPayout: number;
  clTotal: number;
  cash: number;
  cashPayout: number;
  cashExpenses: number;
  notes: string;
  source?: 'file' | 'google_sheets' | 'manual';
  importBindingKey?: string | null;
  sourceRef?: {
    mode?: string | null;
    profileName?: string | null;
    spreadsheetId?: string | null;
    sheetName?: string | null;
    sourceId?: string | null;
    importJobId?: string | null;
    reason?: string | null;
  } | null;
};

export type PosOverviewResponse = {
  kpis: {
    totalSales: number;
    creditCard: number;
    cash: number;
    gas: number;
    lottery: number;
    lotteryPayout: number;
    cashExpenses: number;
    cashPayout: number;
    cashDiff: number;
    netIncome: number;
    avgDailySales: number;
  };
  sparkline7: Array<{ x: string; y: number }>;
  alerts: Array<{
    id: string;
    type: 'sales_drop' | 'cash_diff' | 'lottery_payout_high' | 'tax_mismatch';
    severity: 'low' | 'medium' | 'high';
    message: string;
    data: Record<string, unknown>;
  }>;
  start: string;
  end: string;
};

export type PosDailyPagedResponse = {
  data: PosDailyRecord[];
  totals: {
    totalSales: number;
    creditCard: number;
    cash: number;
    gas: number;
    lottery: number;
    lotteryPayout: number;
    cashExpenses: number;
    cashPayout: number;
    highTax: number;
    lowTax: number;
    saleTax: number;
  };
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  start: string;
  end: string;
};

export type PosTrendDailyPoint = {
  x: string;
  totalSales: number;
  creditCard: number;
  cash: number;
  gas: number;
  lottery: number;
};

export type PosTrendWeeklyPoint = {
  label: string;
  range: string;
  totalSales: number;
  creditCard: number;
  cash: number;
  gas: number;
  lottery: number;
};

export type PosTrendResponse = {
  granularity: 'daily' | 'weekly';
  data: PosTrendDailyPoint[] | PosTrendWeeklyPoint[];
  start: string;
  end: string;
};

export class PosApi {
  importCsv(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pos/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  importFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/pos/import-file', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }

  importRows(rows: string[][], hasHeader = true) {
    return api.post('/pos/import-rows', { rows, hasHeader });
  }

  previewSharedSheetImport() {
    return api.post('/pos/import/sheets/preview');
  }

  previewSheet(payload: { source?: 'service' | 'oauth' | 'file'; tab?: string; maxRows?: number; spreadsheetId?: string; headerRow?: number }) {
    return api.post('/pos/import/sheets/preview', payload);
  }

  validateMapping(payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    validateSample?: boolean;
    tab?: string;
    spreadsheetId?: string;
    headerRow?: number;
  }) {
    return api.post('/pos/import/sheets/match', payload);
  }

  commitSharedSheetImport(payload: {
    mapping: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) {
    return api.post('/pos/import/sheets/commit', payload);
  }

  commitImport(payload: {
    connectorKey?: string;
    integrationType?: 'oauth' | 'shared';
    sourceId?: string;
    profileId?: string;
    mapping?: Record<string, string>;
    transforms?: Record<string, unknown>;
    options?: Record<string, unknown>;
  }) {
    return api.post('/pos/import/sheets/commit', payload);
  }

  readSheet(spreadsheetId: string, range: string, authMode: 'service' | 'oauth') {
    return api.get('/sheets/read', { params: { spreadsheetId, range, authMode } });
  }

  getGoogleConnectUrl() {
    return api.get('/integrations/google/sheets/start-url');
  }

  daily(start: string, end: string) {
    return api.get('/pos/daily', { params: { start, end } });
  }

  dailyPaged(payload: { start?: string; end?: string; page?: number; limit?: number }) {
    return api.get<{ data: PosDailyPagedResponse }>('/pos/daily-paged', { params: payload });
  }

  overview(payload: { start?: string; end?: string }) {
    return api.get<{ data: PosOverviewResponse }>('/pos/overview', { params: payload });
  }

  trend(payload: { start?: string; end?: string; granularity?: 'daily' | 'weekly' }) {
    return api.get<{ data: PosTrendResponse }>('/pos/trend', { params: payload });
  }

  exportCsv(payload: { start?: string; end?: string }) {
    return api.get<Blob>('/pos/export', {
      params: payload,
      responseType: 'blob'
    });
  }

  clear(payload: {
    scope: 'all' | 'date_range' | 'source';
    confirmText: string;
    start?: string;
    end?: string;
    source?: 'google_sheets' | 'file' | 'manual';
  }) {
    return api.post('/pos/clear', payload);
  }
}

export const posApi = new PosApi();
