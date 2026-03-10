import { Router } from 'express';
import {
  disconnectQuickBooks,
  getQuickBooksConnectUrl,
  getQuickBooksOAuthStatus,
  getQuickBooksSettings,
  queueQuickBooksPostApproved,
  queueQuickBooksRefreshReferenceData,
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
  '/disconnect',
  requireAuth,
  requirePermission('quickbooks', 'connect'),
  disconnectQuickBooks
);
router.get('/callback', quickBooksCallback);

export default router;
