import { Router } from 'express';
import {
  disconnectQuickBooks,
  getQuickBooksConnectUrl,
  getQuickBooksOAuthStatus,
  getQuickBooksSettings,
  queueQuickBooksPullAccounts,
  queueQuickBooksPushEntries,
  quickBooksCallback,
  startQuickBooksConnect,
  updateQuickBooksSettings
} from '../controllers/quickbooksController';
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
  '/sync/pull-accounts',
  requireAuth,
  requirePermission('quickbooks', 'sync'),
  queueQuickBooksPullAccounts
);
router.post(
  '/sync/push-entries',
  requireAuth,
  requirePermission('quickbooks', 'sync'),
  queueQuickBooksPushEntries
);
router.post(
  '/disconnect',
  requireAuth,
  requirePermission('quickbooks', 'connect'),
  disconnectQuickBooks
);
router.get('/callback', quickBooksCallback);

export default router;
