import {
  AccountingObservabilityDebug,
  AccountingObservabilitySummary,
  AccountingJobType,
  BankStatementStatus,
  CreateBankStatementInput,
  QuickBooksJournalAdjustmentInput,
  QuickBooksJournalAdjustmentResult,
  QuickBooksRecoverPaymentInput,
  QuickBooksRecoverPaymentResult,
  ListBankStatementsQuery,
  QuickBooksTaxChartAccount,
  QuickBooksTaxLedgerResponse,
  QuickBooksTaxLedgerQuery,
  QuickBooksTaxOverview,
  QuickBooksTaxPaymentsQuery,
  QuickBooksTaxPaymentsResponse,
  QuickBooksTaxReport,
  QuickBooksTaxReportKey,
  QuickBooksTaxWindowQuery,
  QuickBooksSettings,
  RequestStatementUploadUrlInput
} from '@retailsync/shared';
import { api } from '../../../app/api/client';

export class AccountingApi {
  listStatements(params: ListBankStatementsQuery = {}) {
    return api.get<{
      data: {
        statements: Array<{
          id: string;
          statementMonth: string;
          fileName: string;
          source: string;
          status: BankStatementStatus;
          progress: {
            totalChecks: number;
            checksQueued: number;
            checksProcessing: number;
            checksReady: number;
            checksFailed: number;
          };
          confidence?: number;
          issuesCount: number;
          updatedAt: string;
          createdAt: string;
        }>;
      };
    }>('/accounting/statements', { params });
  }

  getStatement(id: string) {
    return api.get('/accounting/statements/' + id);
  }

  getStatementStatus(id: string) {
    return api.get('/accounting/statements/' + id + '/status');
  }

  listStatementChecks(id: string, status?: string) {
    return api.get('/accounting/statements/' + id + '/checks', {
      params: status ? { status } : undefined
    });
  }

  requestUploadUrl(payload: RequestStatementUploadUrlInput) {
    return api.post<{
      data: {
        uploadUrl: string;
        gcsPath: string;
        statementId: string;
        rootPrefix: string;
        expiresAt: string;
      };
    }>('/accounting/statements/upload-url', payload);
  }

  createStatement(payload: CreateBankStatementInput) {
    return api.post('/accounting/statements', payload);
  }

  reprocessStatement(id: string, fromJobType: AccountingJobType = 'statement.extract') {
    return api.post(`/accounting/statements/${id}/reprocess`, { fromJobType });
  }

  retryStatementCheck(statementId: string, checkId: string) {
    return api.post(`/accounting/statements/${statementId}/checks/${checkId}/retry`);
  }

  listLedgerEntries(params?: {
    reviewStatus?: 'proposed' | 'edited' | 'approved' | 'excluded';
    postingStatus?: 'not_posted' | 'posting' | 'posted' | 'failed';
    hasCheck?: boolean;
    type?: 'debit' | 'credit';
    minConfidence?: number;
    startDate?: string;
    endDate?: string;
    search?: string;
    limit?: number;
  }) {
    return api.get('/accounting/ledger/entries', {
      params
    });
  }

  getLedgerEntry(entryId: string) {
    return api.get(`/accounting/ledger/entries/${entryId}`);
  }

  updateLedgerEntry(entryId: string, payload: unknown) {
    return api.patch(`/accounting/ledger/entries/${entryId}`, payload);
  }

  approveLedgerEntry(entryId: string) {
    return api.post(`/accounting/ledger/entries/${entryId}/approve`);
  }

  excludeLedgerEntry(entryId: string) {
    return api.post(`/accounting/ledger/entries/${entryId}/exclude`);
  }

  bulkApproveLedgerEntries(entryIds: string[]) {
    return api.post('/accounting/ledger/entries/bulk-approve', { entryIds });
  }

  postApprovedLedgerEntries() {
    return api.post('/accounting/ledger/post-approved');
  }

  getQuickbooksSettings() {
    return api.get<{
      data: QuickBooksSettings;
    }>('/integrations/quickbooks/settings');
  }

  updateQuickbooksSettings(payload: { environment: 'sandbox' | 'production' }) {
    return api.put('/integrations/quickbooks/settings', payload);
  }

  getQuickbooksConnectUrl(returnTo = '/dashboard/accounting/quickbooks') {
    return api.get<{
      data: {
        url: string;
        environment: 'sandbox' | 'production';
      };
    }>('/integrations/quickbooks/start-url', { params: { returnTo } });
  }

  getQuickbooksOAuthStatus() {
    return api.get<{
      data: {
        ok: boolean;
        reason: string | null;
        environment?: 'sandbox' | 'production';
        realmId: string | null;
        companyName: string | null;
        expiresInSec: number | null;
      };
    }>('/integrations/quickbooks/oauth-status');
  }

  disconnectQuickbooks() {
    return api.post('/integrations/quickbooks/disconnect');
  }

  refreshQuickbooksReferenceData() {
    return api.post('/integrations/quickbooks/sync/refresh-reference-data');
  }

  postApprovedToQuickbooks() {
    return api.post('/integrations/quickbooks/sync/post-approved');
  }

  getQuickbooksTaxOverview(params?: QuickBooksTaxWindowQuery) {
    return api.get<{
      data: QuickBooksTaxOverview;
    }>('/integrations/quickbooks/tax/overview', { params });
  }

  getQuickbooksTaxReport(
    reportKey: QuickBooksTaxReportKey,
    params?: QuickBooksTaxWindowQuery
  ) {
    return api.get<{
      data: QuickBooksTaxReport;
    }>(`/integrations/quickbooks/tax/reports/${reportKey}`, { params });
  }

  getQuickbooksTaxChartOfAccounts() {
    return api.get<{
      data: QuickBooksTaxChartAccount[];
    }>('/integrations/quickbooks/tax/chart-of-accounts');
  }

  getQuickbooksTaxLedger(params?: QuickBooksTaxLedgerQuery) {
    return api.get<{
      data: QuickBooksTaxLedgerResponse;
    }>('/integrations/quickbooks/tax/ledger', { params });
  }

  getQuickbooksTaxPayments(params?: QuickBooksTaxPaymentsQuery) {
    return api.get<{
      data: QuickBooksTaxPaymentsResponse;
    }>('/integrations/quickbooks/tax/payments', { params });
  }

  recoverQuickbooksPayment(payload: QuickBooksRecoverPaymentInput) {
    return api.post<{
      data: QuickBooksRecoverPaymentResult;
    }>('/integrations/quickbooks/tax/recover-payment', payload);
  }

  createQuickbooksJournalAdjustment(payload: QuickBooksJournalAdjustmentInput) {
    return api.post<{
      data: QuickBooksJournalAdjustmentResult;
    }>('/integrations/quickbooks/tax/journal-adjustment', payload);
  }

  getObservabilitySummary() {
    return api.get<{
      data: AccountingObservabilitySummary;
    }>('/accounting/observability/summary');
  }

  runObservabilityDebug(statementId?: string) {
    return api.get<{
      data: AccountingObservabilityDebug;
    }>('/accounting/observability/debug', {
      params: statementId ? { statementId } : undefined
    });
  }
}

export const accountingApi = new AccountingApi();
