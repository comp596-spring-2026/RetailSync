import {
  AccountingObservabilityDebug,
  AccountingObservabilitySummary,
  AccountingJobType,
  BankStatementDetail,
  QuickBooksAccountRegisterQuery,
  QuickBooksAccountRegisterResponse,
  BankStatementListItem,
  BankStatementStatus,
  CreateBankStatementInput,
  DetectStatementMonthResponse,
  QuickBooksLiveTransactionType,
  QuickBooksLiveTransactionsQuery,
  QuickBooksLiveTransactionsResponse,
  QuickBooksJournalAdjustmentInput,
  QuickBooksJournalAdjustmentResult,
  QuickBooksContactCreateInput,
  QuickBooksContactDetail,
  QuickBooksContactUpdateInput,
  QuickBooksMoneyCreateInput,
  QuickBooksMoneyDeleteResult,
  QuickBooksMoneyTxnType,
  QuickBooksMoneyUpdateInput,
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
  QuickBooksTransactionDetail,
  QuickBooksHubChartAccountCreateInput,
  QuickBooksHubChartAccountCreateResponse,
  QuickBooksHubItemsResponse,
  QuickBooksSettings,
  QuickBooksWriteCreateInput,
  QuickBooksWriteDeleteInput,
  QuickBooksWriteDeleteResult,
  QuickBooksWriteDetail,
  QuickBooksWriteListQuery,
  QuickBooksWriteListResponse,
  QuickBooksWriteTxnType,
  QuickBooksWriteUpdateInput,
  StatementCheck,
  StatementMonthClose,
  StatementRule,
  StatementRuleHardness,
  CreateStatementRuleInput,
  UpdateStatementRuleInput,
  StatementTransaction,
  StatementSuggestionsResponse,
  StatementReviewStatus,
  StatementProposalPatch,
  StatementQuickbooksPostResult,
  ResolveTransferSuggestionInput,
  RequestStatementUploadUrlInput
} from '@retailsync/shared';
import { api } from '../../../app/api/client';
import type {
  QuickBooksHubChartOfAccountsParams,
  QuickBooksHubChartOfAccountsPayload,
  QuickBooksHubEntitiesParams,
  QuickBooksHubEntitiesPayload,
  QuickBooksHubEntityType,
  QuickBooksHubOperationsParams,
  QuickBooksHubOperationsPayload
} from '../types/quickbooksHub';

type StatementProgressPayload = {
  phase: BankStatementStatus;
  totalChecks: number;
  checksQueued: number;
  checksProcessing: number;
  checksReady: number;
  checksFailed: number;
  completedChecks: number;
  remainingChecks: number;
};

export class AccountingApi {
  private listQuickBooksHub<TResponse>(path: string, params?: Record<string, unknown>) {
    return api.get<{
      data: TResponse;
    }>(path, { params });
  }

  listStatements(params: ListBankStatementsQuery = {}) {
    return api.get<{
      data: {
        statements: Array<{
          id: string;
          statementMonth: string;
          fileName: string;
          source: string;
          status: BankStatementStatus;
          progress: StatementProgressPayload;
          confidence?: number;
          issuesCount: number;
          updatedAt: string;
          createdAt: string;
        }>;
      };
    }>('/accounting/statements', { params });
  }

  listStatementMonths() {
    return api.get<{
      data: {
        months: Array<{
          month: string;
          statementCount: number;
          latestStatementId: string;
          latestStatus: string;
          monthCloseStatus: string;
          updatedAt: string;
        }>;
      };
    }>('/accounting/statement-months');
  }

  getStatementMonthSummary(month: string) {
    return api.get<{
      data: {
        month: string;
        latestStatementId: string;
        latestStatus: string;
        statementCount: number;
        entryCount: number;
        unresolvedEntries: number;
        unknownEntries: number;
        monthCloseStatus: string;
      };
    }>(`/accounting/statement-months/${month}`);
  }

  getStatement(id: string) {
    return api.get<{
      data: BankStatementDetail;
    }>('/accounting/statements/' + id);
  }

  getStatementStreamUrl(id: string, accessToken?: string | null) {
    const baseUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
    const basePath = `${baseUrl}/accounting/statements/${id}/stream`;
    if (!accessToken) return basePath;
    return `${basePath}?access_token=${encodeURIComponent(accessToken)}`;
  }

  getStatementArtifactBlob(id: string, path: string) {
    return api.get<Blob>(`/accounting/statements/${id}/artifact`, {
      params: { path },
      responseType: 'blob'
    });
  }

  getStatementArtifactText(id: string, path: string) {
    return api.get<string>(`/accounting/statements/${id}/artifact`, {
      params: { path },
      responseType: 'text'
    });
  }

  getStatementStatus(id: string) {
    return api.get<{
      data: {
        statementId: string;
        status: BankStatementStatus;
        progress: StatementProgressPayload;
        liveMetrics: {
          entryCount: number;
          debitCount: number;
          creditCount: number;
          startingBalance: number | null;
          endingBalance: number | null;
        };
        gcs?: {
          rootPrefix: string;
          pdfPath: string;
        };
        updatedAt: string;
        artifacts?: BankStatementDetail['artifacts'];
        checkImagePreview: Array<{
          id: string;
          status: string;
          pageNumber?: number;
          cropImagePath?: string;
          frontPath?: string;
        }>;
        issues: string[];
      };
    }>('/accounting/statements/' + id + '/status');
  }

  listStatementChecks(id: string, status?: string) {
    return api.get<{
      data: {
        checks: StatementCheck[];
      };
    }>('/accounting/statements/' + id + '/checks', {
      params: status ? { status } : undefined
    });
  }

  getStatementSuggestions(id: string) {
    return api.get<{
      data: StatementSuggestionsResponse;
    }>(`/accounting/statements/${id}/suggestions`);
  }

  listStatementRules(id: string) {
    return api.get<{
      data: {
        statementId: string;
        rules: StatementRule[];
      };
    }>(`/accounting/statements/${id}/rules`);
  }

  createStatementRule(id: string, payload: CreateStatementRuleInput) {
    return api.post<{
      data: {
        rule: StatementRule;
      };
    }>(`/accounting/statements/${id}/rules`, payload);
  }

  updateStatementRule(id: string, ruleId: string, payload: UpdateStatementRuleInput) {
    return api.patch<{
      data: {
        rule: StatementRule;
      };
    }>(`/accounting/statements/${id}/rules/${ruleId}`, payload);
  }

  createStatementRuleFromTransaction(id: string, transactionId: string, hardness: StatementRuleHardness) {
    return api.post<{
      data: {
        rule: StatementRule;
      };
    }>(`/accounting/statements/${id}/rules/from-transaction/${transactionId}`, { hardness });
  }

  listStatementEntries(id: string) {
    return api.get<{
      data: {
        statementId: string;
        entries: StatementTransaction[];
      };
    }>(`/accounting/statements/${id}/entries`);
  }

  updateStatementEntryReview(statementId: string, entryId: string, reviewStatus: StatementReviewStatus) {
    return api.patch(`/accounting/statements/${statementId}/entries/${entryId}/review`, {
      reviewStatus
    });
  }

  updateStatementSuggestionReview(
    statementId: string,
    suggestionId: string,
    source: 'transaction' | 'check',
    reviewStatus: StatementReviewStatus,
    proposal?: StatementProposalPatch,
    postToQuickBooks = true
  ) {
    return api.patch<{
      data: {
        suggestionId: string;
        source: 'transaction' | 'check';
        reviewStatus: StatementReviewStatus;
        proposal?: StatementProposalPatch;
        quickbooks?: StatementQuickbooksPostResult;
      };
    }>(`/accounting/statements/${statementId}/suggestions/${suggestionId}/review`, {
      source,
      reviewStatus,
      postToQuickBooks,
      ...(proposal ? { proposal } : {})
    });
  }

  resolveTransferSuggestion(
    statementId: string,
    suggestionId: string,
    payload: ResolveTransferSuggestionInput
  ) {
    return api.patch(`/accounting/statements/${statementId}/suggestions/${suggestionId}/transfer-resolution`, payload);
  }

  completeStatementMonth(id: string) {
    return api.post<{
      data: {
        statementId: string;
        monthClose: StatementMonthClose;
      };
    }>(`/accounting/statements/${id}/complete-month`);
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

  detectStatementMonth(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{
      data: DetectStatementMonthResponse;
    }>('/accounting/statements/detect-month', formData);
  }

  playgroundOfflineExtraction(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{
      data: unknown;
    }>('/accounting/playground/offline-extraction', formData);
  }

  assignStatementBankAccount(statementId: string, payload: { bankAccountId: string }) {
    return api.patch<{
      data: {
        statement: BankStatementListItem;
      };
    }>(`/accounting/statements/${statementId}/bank-account`, payload);
  }

  createStatement(payload: CreateBankStatementInput) {
    return api.post<{
      data: {
        statement: BankStatementListItem;
        queue: {
          taskId?: string;
          queueName?: string;
        } | null;
      };
    }>('/accounting/statements', payload);
  }

  deleteStatement(id: string) {
    return api.delete(`/accounting/statements/${id}`);
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

  disconnectQuickBooks() {
    return api.post('/integrations/quickbooks/disconnect');
  }

  refreshQuickbooksReferenceData() {
    return api.post('/integrations/quickbooks/sync/refresh-reference-data');
  }

  postApprovedToQuickbooks() {
    return api.post('/integrations/quickbooks/sync/post-approved');
  }

  getQuickbooksHubChartOfAccounts(params?: QuickBooksHubChartOfAccountsParams) {
    return this.listQuickBooksHub<QuickBooksHubChartOfAccountsPayload>(
      '/integrations/quickbooks/hub/chart-of-accounts',
      params
    );
  }

  createQuickbooksHubChartAccount(payload: QuickBooksHubChartAccountCreateInput) {
    return api.post<{
      data: QuickBooksHubChartAccountCreateResponse;
    }>('/integrations/quickbooks/hub/chart-of-accounts', payload);
  }

  getQuickbooksHubItems(params?: { page?: number; pageSize?: number; search?: string }) {
    return this.listQuickBooksHub<QuickBooksHubItemsResponse>(
      '/integrations/quickbooks/hub/items',
      params
    );
  }

  getQuickbooksWriteInvoices(params?: { customerId?: string; page?: number; pageSize?: number }) {
    return api.get<{
      data: QuickBooksWriteListResponse;
    }>('/integrations/quickbooks/write/invoice', {
      params: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 100,
        sort: '-date',
        customerId: params?.customerId?.trim() || undefined
      }
    });
  }

  getQuickbooksHubEntities(entityType: QuickBooksHubEntityType, params?: Omit<QuickBooksHubEntitiesParams, 'entityType'>) {
    return this.listQuickBooksHub<QuickBooksHubEntitiesPayload>('/integrations/quickbooks/hub/entities', {
      ...params,
      entityType
    });
  }

  getQuickbooksContact(entityType: Exclude<QuickBooksHubEntityType, 'employee'>, qbId: string) {
    return api.get<{
      data: QuickBooksContactDetail;
    }>(`/integrations/quickbooks/contacts/${entityType}/${qbId}`);
  }

  postQuickbooksContact(
    entityType: Exclude<QuickBooksHubEntityType, 'employee'>,
    payload: QuickBooksContactCreateInput
  ) {
    return api.post<{
      data: QuickBooksContactDetail;
    }>(`/integrations/quickbooks/contacts/${entityType}`, payload);
  }

  patchQuickbooksContact(
    entityType: Exclude<QuickBooksHubEntityType, 'employee'>,
    qbId: string,
    payload: QuickBooksContactUpdateInput
  ) {
    return api.patch<{
      data: QuickBooksContactDetail;
    }>(`/integrations/quickbooks/contacts/${entityType}/${qbId}`, payload);
  }

  deleteQuickbooksContact(entityType: Exclude<QuickBooksHubEntityType, 'employee'>, qbId: string) {
    return api.delete<{
      data: {
        qbId: string;
        deleted: true;
      };
    }>(`/integrations/quickbooks/contacts/${entityType}/${qbId}`);
  }

  getQuickbooksHubOperations(params?: QuickBooksHubOperationsParams) {
    return this.listQuickBooksHub<QuickBooksHubOperationsPayload>(
      '/integrations/quickbooks/hub/operations',
      params
    );
  }

  getQuickbooksAccountRegister(accountId: string, params: QuickBooksAccountRegisterQuery) {
    return api.get<{
      data: QuickBooksAccountRegisterResponse;
    }>(`/integrations/quickbooks/live/registers/${accountId}`, { params });
  }

  getQuickbooksLiveTransactions(
    type: QuickBooksLiveTransactionType,
    params: QuickBooksLiveTransactionsQuery
  ) {
    return api.get<{
      data: QuickBooksLiveTransactionsResponse;
    }>(`/integrations/quickbooks/live/transactions/${type}`, { params });
  }

  getQuickbooksTransactionDetail(type: QuickBooksLiveTransactionType, qbTxnId: string) {
    return api.get<{
      data: QuickBooksTransactionDetail;
    }>(`/integrations/quickbooks/live/transaction/${qbTxnId}`, {
      params: { type }
    });
  }

  postQuickbooksMoneyTransaction(
    txnType: QuickBooksMoneyTxnType,
    payload: QuickBooksMoneyCreateInput
  ) {
    return api.post<{
      data: QuickBooksTransactionDetail;
    }>(`/integrations/quickbooks/money/${txnType}`, payload);
  }

  patchQuickbooksMoneyTransaction(
    txnType: QuickBooksMoneyTxnType,
    qbTxnId: string,
    payload: QuickBooksMoneyUpdateInput
  ) {
    return api.patch<{
      data: QuickBooksTransactionDetail;
    }>(`/integrations/quickbooks/money/${txnType}/${qbTxnId}`, payload);
  }

  deleteQuickbooksMoneyTransaction(txnType: QuickBooksMoneyTxnType, qbTxnId: string) {
    return api.delete<{
      data: QuickBooksMoneyDeleteResult;
    }>(`/integrations/quickbooks/money/${txnType}/${qbTxnId}`);
  }

  getQuickbooksWriteTransactions(txnType: QuickBooksWriteTxnType, params: QuickBooksWriteListQuery) {
    return api.get<{
      data: QuickBooksWriteListResponse;
    }>(`/integrations/quickbooks/write/${txnType}`, { params });
  }

  getQuickbooksWriteTransactionDetail(txnType: QuickBooksWriteTxnType, qbTxnId: string) {
    return api.get<{
      data: QuickBooksWriteDetail;
    }>(`/integrations/quickbooks/write/${txnType}/${qbTxnId}`);
  }

  postQuickbooksWriteTransaction(txnType: QuickBooksWriteTxnType, payload: QuickBooksWriteCreateInput) {
    return api.post<{
      data: QuickBooksWriteDetail;
    }>(`/integrations/quickbooks/write/${txnType}`, payload);
  }

  patchQuickbooksWriteTransaction(
    txnType: QuickBooksWriteTxnType,
    qbTxnId: string,
    payload: QuickBooksWriteUpdateInput
  ) {
    return api.patch<{
      data: QuickBooksWriteDetail;
    }>(`/integrations/quickbooks/write/${txnType}/${qbTxnId}`, payload);
  }

  deleteQuickbooksWriteTransaction(
    txnType: QuickBooksWriteTxnType,
    qbTxnId: string,
    payload: QuickBooksWriteDeleteInput
  ) {
    return api.delete<{
      data: QuickBooksWriteDeleteResult;
    }>(`/integrations/quickbooks/write/${txnType}/${qbTxnId}`, { data: payload });
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
