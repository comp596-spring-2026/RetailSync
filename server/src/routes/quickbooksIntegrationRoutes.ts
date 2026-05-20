import { Router } from 'express';
import {
  disconnectQuickBooks,
  getQuickBooksConnectUrl,
  getQuickBooksOAuthStatus,
  getQuickBooksSettings,
  quickBooksReadQuery,
  queueQuickBooksPostApproved,
  queueQuickBooksRefreshReferenceData,
  quickBooksCallback,
  startQuickBooksConnect,
  updateQuickBooksSettings
} from '../controllers/quickbooksController';
import {
  deleteQuickBooksContactById,
  deleteQuickBooksMoneyTransactionById,
  getQuickBooksContactById,
  getQuickBooksAccountRegisterByAccount,
  getQuickBooksHubChartOfAccounts,
  postQuickBooksHubChartOfAccounts,
  getQuickBooksHubItems,
  postQuickBooksHubItem,
  getQuickBooksHubEntities,
  getQuickBooksHubOperations,
  getQuickBooksLiveTransactionsByType,
  patchQuickBooksContact,
  patchQuickBooksMoneyTransaction,
  postQuickBooksContact,
  getQuickBooksTransactionDetailById,
  getQuickBooksWriteTransactionDetailById,
  getQuickBooksWriteTransactionsByType,
  getQuickBooksTaxChartOfAccounts,
  getQuickBooksTaxLedger,
  getQuickBooksTaxOverview,
  getQuickBooksTaxPayments,
  getQuickBooksTaxReport,
  deleteQuickBooksWriteTransactionById,
  postQuickBooksMoneyTransaction,
  patchQuickBooksWriteTransaction,
  postQuickBooksJournalAdjustment,
  postQuickBooksRecoverPayment,
  postQuickBooksWriteTransaction
} from '../controllers/quickbooksTaxController';
import { requireAuth } from '../middleware/requireAuth';
import { requireAnyPermission } from '../middleware/requireAnyPermission';
import { requirePermission } from '../middleware/requirePermission';
import { requireQuickBooksMutation } from '../middleware/requireQuickBooksMutation';
import { requireQuickBooksDisconnect } from '../middleware/requireQuickBooksDisconnect';

const requireQuickBooksConnect = requireAnyPermission([
  { moduleKey: 'quickbooks', action: 'connect' },
  { moduleKey: 'quickbooks', action: 'edit' }
]);

/** Statement review posting uses hub read APIs without full QuickBooks workspace access. */
const requireStatementQuickBooksHubRead = requireAnyPermission([
  { moduleKey: 'quickbooks', action: 'view' },
  { moduleKey: 'bankStatements', action: 'view' },
  { moduleKey: 'bankStatements', action: 'edit' }
]);

const requireStatementQuickBooksHubCreate = requireAnyPermission([
  { moduleKey: 'quickbooks', action: 'create' },
  { moduleKey: 'quickbooks', action: 'edit' },
  { moduleKey: 'bankStatements', action: 'edit' }
]);

const requireStatementQuickBooksReferenceRefresh = requireAnyPermission([
  { moduleKey: 'quickbooks', action: 'sync' },
  { moduleKey: 'bankStatements', action: 'edit' }
]);

const router = Router();

router.get(
  '/oauth-status',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksOAuthStatus
);
router.get(
  '/settings',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksSettings
);
router.put(
  '/settings',
  requireAuth,
  requireQuickBooksConnect,
  updateQuickBooksSettings
);
router.get(
  '/start-url',
  requireAuth,
  requireQuickBooksConnect,
  getQuickBooksConnectUrl
);
router.get(
  '/start',
  requireAuth,
  requireQuickBooksConnect,
  startQuickBooksConnect
);
router.post(
  '/sync/refresh-reference-data',
  requireAuth,
  requireStatementQuickBooksReferenceRefresh,
  queueQuickBooksRefreshReferenceData
);
router.post(
  '/sync/post-approved',
  requireAuth,
  requirePermission('quickbooks', 'sync'),
  queueQuickBooksPostApproved
);
router.post(
  '/query',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  quickBooksReadQuery
);
router.get(
  '/live/registers/:accountId',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksAccountRegisterByAccount
);
router.get(
  '/live/transactions/:type',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksLiveTransactionsByType
);
router.get(
  '/live/transaction/:qbTxnId',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksTransactionDetailById
);
router.post(
  '/money/:txnType',
  requireAuth,
  requireQuickBooksMutation('create'),
  postQuickBooksMoneyTransaction
);
router.patch(
  '/money/:txnType/:qbTxnId',
  requireAuth,
  requireQuickBooksMutation('edit'),
  patchQuickBooksMoneyTransaction
);
router.delete(
  '/money/:txnType/:qbTxnId',
  requireAuth,
  requireQuickBooksMutation('delete'),
  deleteQuickBooksMoneyTransactionById
);
router.get(
  '/write/:txnType',
  requireAuth,
  requireStatementQuickBooksHubRead,
  getQuickBooksWriteTransactionsByType
);
router.get(
  '/write/:txnType/:qbTxnId',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksWriteTransactionDetailById
);
router.post(
  '/write/:txnType',
  requireAuth,
  requireQuickBooksMutation('create'),
  postQuickBooksWriteTransaction
);
router.patch(
  '/write/:txnType/:qbTxnId',
  requireAuth,
  requireQuickBooksMutation('edit'),
  patchQuickBooksWriteTransaction
);
router.delete(
  '/write/:txnType/:qbTxnId',
  requireAuth,
  requireQuickBooksMutation('delete'),
  deleteQuickBooksWriteTransactionById
);
router.get(
  '/hub/chart-of-accounts',
  requireAuth,
  requireStatementQuickBooksHubRead,
  getQuickBooksHubChartOfAccounts
);
router.post(
  '/hub/chart-of-accounts',
  requireAuth,
  requireStatementQuickBooksHubCreate,
  postQuickBooksHubChartOfAccounts
);
router.get(
  '/hub/items',
  requireAuth,
  requireStatementQuickBooksHubRead,
  getQuickBooksHubItems
);
router.post(
  '/hub/items',
  requireAuth,
  requireStatementQuickBooksHubCreate,
  postQuickBooksHubItem
);
router.get(
  '/hub/entities',
  requireAuth,
  requireStatementQuickBooksHubRead,
  getQuickBooksHubEntities
);
router.get(
  '/contacts/:entityType/:qbId',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksContactById
);
router.post(
  '/contacts/:entityType',
  requireAuth,
  requireStatementQuickBooksHubCreate,
  postQuickBooksContact
);
router.patch(
  '/contacts/:entityType/:qbId',
  requireAuth,
  requireQuickBooksMutation('edit'),
  patchQuickBooksContact
);
router.delete(
  '/contacts/:entityType/:qbId',
  requireAuth,
  requireQuickBooksMutation('delete'),
  deleteQuickBooksContactById
);
router.get(
  '/hub/operations',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksHubOperations
);
router.get(
  '/tax/overview',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksTaxOverview
);
router.get(
  '/tax/reports/:reportKey',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksTaxReport
);
router.get(
  '/tax/chart-of-accounts',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksTaxChartOfAccounts
);
router.get(
  '/tax/ledger',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksTaxLedger
);
router.get(
  '/tax/payments',
  requireAuth,
  requirePermission('quickbooks', 'view'),
  getQuickBooksTaxPayments
);
router.post(
  '/tax/recover-payment',
  requireAuth,
  requireQuickBooksMutation('create'),
  postQuickBooksRecoverPayment
);
router.post(
  '/tax/journal-adjustment',
  requireAuth,
  requireQuickBooksMutation('create'),
  postQuickBooksJournalAdjustment
);

router.post('/disconnect', requireAuth, requireQuickBooksDisconnect, disconnectQuickBooks);
router.get('/callback', quickBooksCallback);

export default router;
