import {
  AccountingObservabilityDebug,
  AccountingObservabilitySummary,
  AccountingJobType,
  BankStatementStatus,
  CreateBankStatementInput,
  ListBankStatementsQuery,
  QuickBooksSettings,
  RequestStatementUploadUrlInput,
  UpdateStatementTransactionsInput
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
          processingStage?: string;
          pageCount: number;
          checkCount: number;
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

  requestUploadUrl(payload: RequestStatementUploadUrlInput) {
    return api.post<{
      data: {
        uploadUrl: string;
        gcsPath: string;
        statementId: string;
        expiresAt: string;
      };
    }>('/accounting/statements/upload-url', payload);
  }

  createStatement(payload: CreateBankStatementInput) {
    return api.post('/accounting/statements', payload);
  }

  reprocessStatement(id: string, fromJobType: AccountingJobType = 'render_pages') {
    return api.post(`/accounting/statements/${id}/reprocess`, { fromJobType });
  }

  confirmStatement(id: string) {
    return api.post(`/accounting/statements/${id}/confirm`);
  }

  updateStatementTransactions(id: string, payload: UpdateStatementTransactionsInput) {
    return api.patch(`/accounting/statements/${id}/transactions`, payload);
  }

  lockStatement(id: string) {
    return api.post(`/accounting/statements/${id}/lock`);
  }

  listLedgerEntries(status?: 'draft' | 'posted' | 'reversed') {
    return api.get<{
      data: {
        entries: Array<{
          _id: string;
          date: string;
          memo: string;
          status: 'draft' | 'posted' | 'reversed';
          lines: Array<{ accountCode: string; debit: number; credit: number; category?: string }>;
          source?: { statementId?: string; transactionId?: string };
          postedAt?: string | null;
        }>;
      };
    }>('/accounting/ledger/entries', {
      params: status ? { status } : undefined
    });
  }

  listChartOfAccounts() {
    return api.get('/accounting/ledger/accounts');
  }

  seedChartOfAccounts() {
    return api.post('/accounting/ledger/accounts/seed');
  }

  postLedgerEntry(entryId: string) {
    return api.post(`/accounting/ledger/entries/${entryId}/post`);
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

  pullQuickbooksAccounts() {
    return api.post<{
      data: {
        queue: {
          taskId: string;
          mode: 'inline' | 'cloud';
          status: 'inline_executed' | 'queued';
          queueName?: string;
        };
      };
    }>('/integrations/quickbooks/sync/pull-accounts');
  }

  pushQuickbooksEntries() {
    return api.post<{
      data: {
        queue: {
          taskId: string;
          mode: 'inline' | 'cloud';
          status: 'inline_executed' | 'queued';
          queueName?: string;
        };
      };
    }>('/integrations/quickbooks/sync/push-entries');
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
