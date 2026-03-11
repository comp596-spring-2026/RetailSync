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
  getQuickBooksTaxChartOfAccounts,
  getQuickBooksTaxLedger,
  getQuickBooksTaxOverview,
  getQuickBooksTaxPayments,
  getQuickBooksTaxReport,
  postQuickBooksJournalAdjustment,
  postQuickBooksRecoverPayment
} from '../controllers/quickbooksTaxController';
import { requireAuth } from '../middleware/requireAuth';
import { requirePermission } from '../middleware/requirePermission';

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
  requirePermission('quickbooks', 'connect'),
  updateQuickBooksSettings
);
router.get(
  '/start-url',
  requireAuth,
  requirePermission('quickbooks', 'connect'),
  getQuickBooksConnectUrl
);
router.get(
  '/start',
  requireAuth,
  requirePermission('quickbooks', 'connect'),
  startQuickBooksConnect
);
router.post(
  '/sync/refresh-reference-data',
  requireAuth,
  requirePermission('quickbooks', 'sync'),
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
  requirePermission('quickbooks', 'post'),
  postQuickBooksRecoverPayment
);
router.post(
  '/tax/journal-adjustment',
  requireAuth,
  requirePermission('quickbooks', 'post'),
  postQuickBooksJournalAdjustment
);

router.post(
  '/disconnect',
  requireAuth,
  requirePermission('quickbooks', 'connect'),
  disconnectQuickBooks
);
router.get('/callback', quickBooksCallback);

export default router;
